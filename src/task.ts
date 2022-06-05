/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { StepFn, StepTaskArg, TaskOptions, TaskStatus } from './types/task';

import cron, { ScheduledTask } from 'node-cron';
import { asyncRetry } from './lib/asyncRetry';
import { parseError } from './lib/parseError';
import { UtilityClass } from './lib/UtilityClass';
import { TaskerLogger } from './types/logger';
import { DataApi } from './data-api';
import { noOpLogger } from './lib/noOpLogger';
import { merge } from './lib/merge';

const ABORT = Symbol('abort');
const RETRY = Symbol('retry');
const CONTINUE = Symbol('continue');
const FINISH = Symbol('finish');

export class Task<
  S extends Record<string, DataApi<any, any, any>>,
  T extends Record<string, DataApi<any, any, any>>,
  L
> extends UtilityClass<TaskStatus> {
  public name: string;
  public status: TaskStatus;
  public logger: TaskerLogger = noOpLogger;
  public targets: T;
  public sources: S;
  protected steps: StepFn<S, T, L>[];
  protected cronTask: ScheduledTask | null = null;
  protected interval: number | null = null;
  protected continueInterval: number | null = null;
  protected useInterval = false;
  protected intervalTimeoutHandle: NodeJS.Timeout | null = null;
  protected retry = 0;
  protected forcedStop = false;
  protected isOneOff: boolean;
  protected rejectPromises: (() => any)[] = [];

  protected stepParams: StepTaskArg<S, T, L> = {
    state: {} as L,
    setTargetLastUpdated: (target, path, date) => {
      if (!this.targets || !this.targets[target])
        throw new TypeError(`Target ${String(target)} not provided as a dependency`);
      this.targets[target].setTargetLastUpdated(path as string, date);
    },
    setSourceLastUpdated: (source, path, date) => {
      if (!this.sources || !this.sources[source])
        throw new TypeError(`Source ${String(source)} not provided as a dependency`);
      this.sources[source].setSourceLastUpdated(path as string, date);
    },
    getTargetLastUpdated: (target, path) => {
      if (!this.targets || !this.targets[target])
        throw new TypeError(`Target ${String(target)} not provided as a dependency`);
      return this.targets[target].getTargetLastUpdated(path as string);
    },
    getSourceLastUpdated: (source, path) => {
      if (!this.sources || !this.sources[source])
        throw new TypeError(`Source ${String(source)} not provided as a dependency`);
      return this.sources[source].getSourceLastUpdated(path as string);
    },
    getFromSource: <N extends keyof S, P extends keyof S[N]['sources'], X extends Parameters<S[N]['sources'][P]>[1]>(
      source: N,
      path: P,
      params: X
    ) => {
      if (!this.sources || !this.sources[source])
        throw new TypeError(`Source ${String(source)} not provided as a dependency`);
      return this.sources[source].callSourceApi(path as string, params) as ReturnType<S[N]['sources'][P]>;
    },
    sendToTarget: <N extends keyof T, P extends keyof T[N]['targets'], X extends Parameters<T[N]['targets'][P]>[1]>(
      target: N,
      path: P,
      params: X
    ) => {
      if (!this.targets || !this.targets[target])
        throw new TypeError(`Target ${String(target)} not provided as a dependency`);
      return this.targets[target].callTargetApi(path as string, params) as ReturnType<T[N]['targets'][P]>;
    },
    abort: ABORT,
    retry: RETRY,
    continue: CONTINUE,
    finish: FINISH,
    log: this.logger,
    retries: 0,
    waitFor: (promise) => this.waitForPromise(promise),
  };

  constructor(options: TaskOptions<S, T, L>) {
    super();
    const { schedule, interval, continueInterval, retry } = options;
    this.name = options.name;
    this.steps = options.steps;
    this.sources = options.sources as S;
    this.targets = options.targets as T;
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
    this.isOneOff = !isScheduleStr && !isintervalNum;
    this.status = {
      name: this.name,
      status: 'Ready',
      step: null,
      lastExecuted: null,
      lastError: null,
      error: null,
    };
  }

  public setState(state: Partial<L>) {
    this.stepParams.state = merge(this.stepParams.state, state);
  }

  public register(logger: TaskerLogger) {
    this.logger = logger;
  }
  public async forceStop() {
    if (this.status.status === 'Running') {
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
    this.changeStatus({ status: this.status.status === 'Running' ? 'Stopping' : 'Stopped' });
    this.rejectPromises.forEach((fn) => fn());
    this.rejectPromises = [];
  }

  public forceStart() {
    if (this.status.status !== 'Running') {
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

  public async execute() {
    if (this.useInterval && this.intervalTimeoutHandle) {
      clearTimeout(this.intervalTimeoutHandle);
    }
    this.logger.debug('Task started');
    this.changeStatus({ status: 'Running', step: null, lastError: null, error: null });
    const output = await asyncRetry(() => this.runSteps(), this.retry, this.logger.error.bind(this.logger));
    if (this.status.status === 'Error') {
      this.logger.debug('Task failed');
    } else {
      this.changeStatus({
        status: this.forcedStop
          ? 'Stopped'
          : this.useInterval || !!this.cronTask
          ? 'Scheduled'
          : output === FINISH
          ? 'Completed'
          : 'Ready',
        step: null,
        lastExecuted: Date.now(),
        lastError: null,
        error: null,
      });
    }
    if (this.useInterval) {
      this.intervalTimeoutHandle = setTimeout(
        () => this.execute(),
        output === CONTINUE && typeof this.continueInterval === 'number'
          ? this.continueInterval
          : (this.interval as number)
      );
    }
  }

  protected async runSteps(): Promise<symbol | void> {
    let output: void | symbol;
    allStepLoop: for (const step of this.steps) {
      if (this.forcedStop) break;
      const name = step.name;
      this.logger.debug(`Step: ${name}`);
      this.changeStatus({ step: name });
      this.stepParams.retries = 0;
      do {
        try {
          if (this.forcedStop) break;
          if (this.stepParams.retries > 0) {
            this.logger.debug('Retrying step: ' + step.name + '; retry: ' + this.stepParams.retries);
          }
          output = await step(this.stepParams);
          if (output === ABORT || output === FINISH) {
            if (output === ABORT) this.logger.debug('Aborting task in step ' + step.name);
            else if (output === FINISH) this.logger.debug('Task reported completed in step ' + step.name);
            break allStepLoop;
          }
        } catch (err) {
          const [message, details] = parseError(err);
          this.logger.error(message, details);
          this.changeStatus({ status: 'Error', lastError: Date.now(), error: message });
          break allStepLoop;
        }
        this.stepParams.retries++;
      } while (output === RETRY);
    }
    return output;
  }

  protected waitForPromise<T>(promise: Promise<T>): Promise<T> {
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
}
