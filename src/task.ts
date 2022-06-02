import type { StepFn, StepTaskArg, TaskOptions, TaskStatus } from './types/task';

import cron, { ScheduledTask } from 'node-cron';
import { asyncRetry } from './lib/asyncRetry';
import { parseError } from './lib/parseError';
import { UtilityClass } from './lib/UtilityClass';
import { TaskerLogger } from './types/logger';
import { DataApi } from './data-api';

const ABORT = Symbol('abort');
const RETRY = Symbol('retry');
const CONTINUE = Symbol('continue');
const FINISH = Symbol('finish');

export class Task extends UtilityClass<TaskStatus> {
  public status: TaskStatus;
  protected cronTask: ScheduledTask | null = null;
  protected interval: number | null = null;
  protected continueInterval: number | null = null;
  protected useInterval = false;
  protected intervalTimeoutHandle: NodeJS.Timeout | null = null;
  protected retry = 0;
  protected forcedStop = false;
  protected isOneOff: boolean;
  protected rejectPromises: (() => any)[] = [];

  protected stepParams: StepTaskArg = {
    setTargetLastUpdated: (target: string, path: string, date: number | null) =>
      this.targets[target].setLastUpdated(path, date),
    setSourceLastUpdated: (source: string, path: string, date: number | null) =>
      this.sources[source].setLastUpdated(path, date),
    getTargetLastUpdated: (target: string, path: string) => this.targets[target].getLastUpdated(path),
    getSourceLastUpdated: (source: string, path: string) => this.sources[source].getLastUpdated(path),
    getFromSource: (source: string, path: string, params: any) => this.sources[source].callApi(path, params),
    sendToTarget: (target: string, path: string, params: any) => this.targets[target].callApi(path, params),
    abort: ABORT,
    retry: RETRY,
    continue: CONTINUE,
    finish: FINISH,
    log: this.logger,
    dependencies: this.dependencies,
    retries: 0,
    waitFor: (promise) => this.waitForPromise(promise),
  };

  constructor(
    protected name: string,
    { schedule, interval, continueInterval, retry }: TaskOptions,
    protected steps: { name: string; step: StepFn }[],
    protected sources: Record<string, DataApi>,
    protected targets: Record<string, DataApi>,
    protected dependencies: Record<string, any>,
    public logger: TaskerLogger
  ) {
    super();
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

  public async execute(params?: any) {
    if (this.useInterval && this.intervalTimeoutHandle) {
      clearTimeout(this.intervalTimeoutHandle);
    }
    this.logger.debug('Task started');
    this.changeStatus({ status: 'Running', step: null, lastError: null, error: null });
    const output = await asyncRetry(() => this.runSteps(params), this.retry, this.logger.error.bind(this.logger));
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

  protected async runSteps(params: any): Promise<symbol | void> {
    let output: any = params;
    allStepLoop: for (const nameStep of this.steps) {
      if (this.forcedStop) break;
      const { name, step } = nameStep;
      this.logger.debug(`Step: ${name}`);
      this.changeStatus({ step: name });
      this.stepParams.retries = 0;
      do {
        try {
          if (this.forcedStop) break;
          if (this.stepParams.retries > 0) {
            this.logger.debug('Retrying step: ' + step.name + '; retry: ' + this.stepParams.retries);
          }
          output = await step(this.stepParams, output);
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
