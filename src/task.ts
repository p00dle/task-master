import type { DataSourceFunction } from './data-sources';
import type { HttpSessionObject } from '@kksiuda/http-session';
import cron, { ScheduledTask } from 'node-cron';
import { TaskMasterLogger, Unsubscribe } from './types';
import { asyncRetry } from './lib/asyncRetry';
import { parseError } from './lib/parseError';

type DataSourceParams<T extends DataSourceFunction> = T extends (
  session: HttpSessionObject<any>,
  params: infer P
) => Promise<any>
  ? P
  : never;
type DataSourceReturn<T extends DataSourceFunction> = T extends (
  session: HttpSessionObject<any>,
  params: any
) => Promise<infer R>
  ? R
  : never;

export interface StepParams<
  DSG extends Record<string, Record<string, DataSourceFunction>>,
  DSS extends Record<string, Record<string, DataSourceFunction>>,
  DSGN extends keyof DSG,
  DSSN extends keyof DSS,
  L,
  DEPS extends Record<string, any>,
  DEPSN extends keyof DEPS
> {
  local: L;
  setTargetLastUpdated: <N extends DSSN, P extends keyof DSS[N]>(
    dataSourceName: N,
    path: P,
    date: number | null
  ) => void;
  setSourceLastUpdated: <N extends DSGN, P extends keyof DSG[N]>(
    dataSourceName: N,
    path: P,
    date: number | null
  ) => void;
  getTargetLastUpdated: <N extends DSSN, P extends keyof DSS[N]>(dataSourceName: N, path: P) => number | null;
  getSourceLastUpdated: <N extends DSGN, P extends keyof DSG[N]>(dataSourceName: N, path: P) => number | null;
  get: <N extends DSGN, P extends keyof DSG[N]>(
    dataSourceName: N,
    path: P,
    params: keyof DSG[N] extends never ? never : DataSourceParams<DSG[N][P]>
  ) => Promise<DataSourceReturn<DSG[N][P]>>;
  set: <N extends DSSN, P extends keyof DSS[N]>(
    dataSourceName: N,
    path: P,
    params: DataSourceParams<DSS[N][P]>
  ) => Promise<DataSourceReturn<DSS[N][P]>>;
  abort: symbol;
  retry: symbol;
  continue: symbol;
  finish: symbol;
  log: TaskMasterLogger;
  dependencies: Pick<DEPS, DEPSN>;
  retries: number;
  waitFor: <T>(promise: Promise<T>) => Promise<T>;
}

export interface TaskParams<
  DSG extends Record<string, Record<string, DataSourceFunction>>,
  DSS extends Record<string, Record<string, DataSourceFunction>>,
  DSGN extends keyof DSG,
  DSSN extends keyof DSS,
  L,
  DEPS extends Record<string, any>,
  DEPSN extends keyof DEPS
> {
  sources?: DSGN[];
  targets?: DSSN[];
  schedule?: string;
  interval?: number;
  continueInterval?: number;
  retry?: number;
  dependencies?: DEPSN[];
  steps: ((task: StepParams<DSG, DSS, DSGN, DSSN, L, DEPS, DEPSN>) => Promise<void | symbol>)[];
}

export interface TaskStatus {
  name: string;
  status: 'ready' | 'running' | 'stopping' | 'error' | 'scheduled' | 'completed' | 'stopped';
  step: string | null;
  lastExecuted: number | null;
  lastError: number | null;
  error: string | null;
}

type StatusListener = (status: TaskStatus) => any;
type AllStatusListener = (statuses: TaskStatus[]) => any;

interface DataSourceRegistrar {
  get(dataSource: any, path: any, params: any): Promise<any>;
  set(dataSource: any, path: any, params: any): Promise<any>;
  setTargetLastUpdated(dataSource: any, path: any, date: number | null): void;
  setSourceLastUpdated(dataSource: any, path: any, date: number | null): void;
  getTargetLastUpdated(dataSource: any, path: any): number | null;
  getSourceLastUpdated(dataSource: any, path: any): number | null;
}

export class Task {
  protected cronTask: ScheduledTask | null = null;
  protected interval: number | null = null;
  protected continueInterval: number | null = null;
  protected status: TaskStatus = this.makeStatus(undefined, true);
  protected useInterval = false;
  protected intervalTimeoutHandle: NodeJS.Timeout | null = null;
  protected retry = 0;
  protected forcedStop = false;
  protected dependencies: any;
  protected steps: ((task: StepParams<any, any, any, any, any, any, any>) => Promise<void | symbol>)[];
  protected isOneOff: boolean;
  protected listeners: StatusListener[] = [];
  protected symbols = {
    abort: Symbol('abort'),
    retry: Symbol('retry'),
    continue: Symbol('continue'),
    finish: Symbol('finish'),
  };
  private rejectPromises: (() => any)[] = [];
  private waitForPromise<T>(promise: Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const rejector = () => {
        settled = true;
        reject('Task forcefully shut down');
      };
      this.rejectPromises.push(rejector);
      const clearRejector = () => {
        settled = true;
        const index = this.rejectPromises.indexOf(rejector);
        if (index >= 0) this.rejectPromises.splice(index, 1);
      };
      promise.then(
        (value) => {
          if (!settled) {
            clearRejector();
            resolve(value);
          }
        },
        (err) => {
          if (!settled) {
            clearRejector;
            reject(err);
          }
        }
      );
    });
  }
  protected stepParams: StepParams<any, any, any, any, any, any, any> = {
    local: this.defaultLocalState,
    setTargetLastUpdated: this.dataSourceRegistrar.setTargetLastUpdated.bind(this.dataSourceRegistrar),
    setSourceLastUpdated: this.dataSourceRegistrar.setSourceLastUpdated.bind(this.dataSourceRegistrar),
    getTargetLastUpdated: this.dataSourceRegistrar.getTargetLastUpdated.bind(this.dataSourceRegistrar),
    getSourceLastUpdated: this.dataSourceRegistrar.getSourceLastUpdated.bind(this.dataSourceRegistrar),
    get: this.dataSourceRegistrar.get.bind(this.dataSourceRegistrar),
    set: this.dataSourceRegistrar.set.bind(this.dataSourceRegistrar),
    abort: this.symbols.abort,
    retry: this.symbols.retry,
    continue: this.symbols.continue,
    finish: this.symbols.finish,
    retries: 0,
    dependencies: this.allDependencies,
    log: this.logger,
    waitFor: this.waitForPromise.bind(this),
  };
  constructor(
    protected name: string,
    { schedule, interval, continueInterval, retry, dependencies, steps }: TaskParams<any, any, any, any, any, any, any>,
    protected defaultLocalState: any = {},
    protected dataSourceRegistrar: DataSourceRegistrar,
    protected allDependencies: Record<string, any>,
    protected logger: TaskMasterLogger
  ) {
    const isScheduleStr = typeof schedule === 'string';
    const isintervalNum = typeof interval === 'number';
    const isConIntervalNum = typeof continueInterval === 'number';
    const isRetryNum = typeof retry === 'number';
    if (isScheduleStr && (isintervalNum || isConIntervalNum)) {
      throw new TypeError('when schedule is specified both interval and continueInterval cannot be used');
    }
    if (isScheduleStr) {
      if (!cron.validate(schedule)) throw new TypeError('Invalid cron schedule: ' + schedule);
      this.cronTask = cron.schedule(schedule, this.execute.bind(this));
    }
    if (isintervalNum) this.interval = interval;
    this.useInterval = isintervalNum;
    if (isConIntervalNum) this.continueInterval = continueInterval;
    if (isRetryNum) this.retry = retry;
    this.steps = steps;
    this.dependencies = dependencies;
    this.isOneOff = !isScheduleStr && !isintervalNum;
  }

  public subscribe(listener: StatusListener): Unsubscribe {
    this.listeners.push(listener);
    listener(this.makeStatus());
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  public async forceStop() {
    if (this.status.status === 'running') {
      this.logger.debug('Forcing task to stop');
    } else {
    }
    if (this.cronTask) {
      this.cronTask.stop();
    }
    if (this.useInterval && this.intervalTimeoutHandle) {
      clearTimeout(this.intervalTimeoutHandle);
    }
    this.forcedStop = true;
    this.changeStatus({ status: this.status.status === 'running' ? 'stopping' : 'stopped' });
    this.rejectPromises.forEach((fn) => fn());
    this.rejectPromises = [];
  }

  public forceStart() {
    if (this.status.status !== 'running') {
      if (this.cronTask) {
        this.cronTask.start();
      }
      if (this.useInterval && this.intervalTimeoutHandle) {
        clearTimeout(this.intervalTimeoutHandle);
      }
      this.forcedStop = false;
      return this.execute();
    } else {
      return Promise.resolve();
    }
  }
  protected makeStatus(updates?: Partial<TaskStatus>, isEmpty = false): TaskStatus {
    if (isEmpty) {
      return {
        name: this.name,
        status: 'ready',
        step: null,
        lastExecuted: null,
        lastError: null,
        error: null,
      };
    } else if (updates) {
      return { ...this.status, ...updates };
    } else {
      return this.status;
    }
  }

  protected changeStatus(updates: Partial<TaskStatus>) {
    this.status = this.makeStatus(updates);
    this.listeners.forEach((fn) => fn(this.status));
  }

  protected async runSteps(): Promise<symbol | void> {
    let symbol: symbol | void = undefined;
    allStepLoop: for (const step of this.steps) {
      if (this.forcedStop) break;
      this.logger.debug('Step: ');
      this.changeStatus({ step: step.name });
      this.stepParams.retries = 0;
      do {
        try {
          if (this.forcedStop) break;
          if (this.stepParams.retries > 0) {
            this.logger.debug('Retrying step: ' + step.name + '; retry: ' + this.stepParams.retries);
          }
          symbol = await step(this.stepParams);
          if (symbol === this.symbols.abort || symbol === this.symbols.finish) {
            if (symbol === this.symbols.abort) this.logger.debug('Aborting task in step ' + step.name);
            else if (symbol === this.symbols.finish) this.logger.debug('Task reported completed in step ' + step.name);
            break allStepLoop;
          }
        } catch (err) {
          const [message, details] = parseError(err);
          this.logger.error(message, details);
          this.changeStatus({ status: 'error', lastError: Date.now(), error: message });
          break allStepLoop;
        }
        this.stepParams.retries++;
      } while (symbol === this.symbols.retry);
    }
    return symbol;
  }

  protected async execute() {
    if (this.useInterval && this.intervalTimeoutHandle) {
      clearTimeout(this.intervalTimeoutHandle);
    }
    if (this.defaultLocalState && typeof this.defaultLocalState === 'object') {
      this.stepParams.local = { ...this.defaultLocalState };
    } else {
      this.stepParams.local = this.defaultLocalState;
    }
    let symbol: symbol | void = undefined;
    this.logger.debug('Task started');
    this.changeStatus({ status: 'running', step: null, lastError: null, error: null });
    symbol = await asyncRetry(
      () => this.runSteps(),
      this.retry,
      // (message, details) => this.logger.error({ message, details })
      (message, details) => console.error({ message, details, 'via-console-error': true })
    );
    if (this.status.status === 'error') {
      this.logger.debug('Task failed');
    } else {
      this.changeStatus({
        status: this.forcedStop
          ? 'stopped'
          : this.useInterval || !!this.cronTask
          ? 'scheduled'
          : symbol === this.symbols.finish
          ? 'completed'
          : 'ready',
        step: null,
        lastExecuted: Date.now(),
        lastError: null,
        error: null,
      });
    }
    if (this.useInterval) {
      this.intervalTimeoutHandle = setTimeout(
        () => this.execute(),
        symbol === this.symbols.continue && typeof this.continueInterval === 'number'
          ? this.continueInterval
          : (this.interval as number)
      );
    }
    this.stepParams.local = null;
  }
}

export class TaskRegistrar {
  protected names: string[] = [];
  protected tasks: Record<string, Task> = {};
  protected taskStatuses: Record<string, TaskStatus> = {};
  protected listeners: AllStatusListener[] = [];
  protected unsubscribers: Unsubscribe[] = [];
  protected logger: TaskMasterLogger;
  constructor(
    protected dataSourceRegistrar: DataSourceRegistrar,
    protected allDependencies: Record<string, any>,
    logger: TaskMasterLogger
  ) {
    this.logger = logger.namespace('Task');
  }
  public subscribeToStatusChange(listener: AllStatusListener) {
    this.listeners.push(listener);
    listener(this.names.map((name) => this.taskStatuses[name]));
    return () => {
      const index = this.listeners.findIndex((fn) => fn === listener);
      if (index >= 0) this.listeners.splice(index, 1);
      if (this.listeners.length === 0) {
        this.unsubscribers.forEach((fn) => fn());
        this.unsubscribers = [];
      }
    };
  }
  public register(
    name: string,
    taskParams: TaskParams<any, any, any, any, any, any, any>,
    defaultLocalState: any
  ): this {
    if (this.tasks[name]) return this;
    this.names.push(name);
    this.tasks[name] = new Task(
      name,
      taskParams,
      defaultLocalState,
      this.dataSourceRegistrar,
      this.allDependencies,
      this.logger.namespace(name)
    );
    this.unsubscribers.push(
      this.tasks[name].subscribe((status) => {
        this.taskStatuses[name] = status;
        const statuses = this.names.map((name) => this.taskStatuses[name]);
        this.listeners.forEach((fn) => fn(statuses));
      })
    );
    return this;
  }

  public forceStop(name?: string) {
    if (name) {
      return this.tasks[name].forceStop();
    } else {
      return Promise.all(this.names.map((name) => this.tasks[name].forceStop()));
    }
  }

  public forceStart(name?: string) {
    if (name) {
      return this.tasks[name].forceStart();
    } else {
      return Promise.all(this.names.map((name) => this.tasks[name].forceStart()));
    }
  }
}
