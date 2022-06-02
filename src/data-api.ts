import type { TaskerLogger } from './types/logger';
import type { DataApiDeps, DataApiFunc, DataApiOptions, DataApiStatus } from './types/data-api';
import { UtilityClass } from './lib/UtilityClass';
import { noOpLogger } from './lib/noOpLogger';
import { HttpSessionObject } from './types/session';

export class DataApi<S, T extends DataApiOptions<S>> extends UtilityClass<DataApiStatus<T>> {
  public status: DataApiStatus<T>;
  public logger: TaskerLogger = noOpLogger;
  public deps: DataApiDeps<S>;
  constructor(public name: string, dependencies: DataApiDeps<S>, protected api: T) {
    super();
    this.status = {
      name,
      lastTouched: {} as Record<keyof T, number | null>,
      lastUpdated: {} as Record<keyof T, number | null>,
      status: 'Ready',
      inQueue: 0,
    };
    for (const apiName of Object.keys(this.api) as (keyof T)[]) {
      this.status.lastTouched[apiName] = null;
      this.status.lastUpdated[apiName] = null;
    }
    this.deps = dependencies;
  }

  public register(logger: TaskerLogger) {
    this.logger = logger;
  }
  public setLastUpdated(path: keyof T, date: number | null) {
    this.logger.debug(`Last updated set to ${typeof date === 'number' ? new Date(date).toString() : 'null'}`);
    this.changeStatus({ lastUpdated: { ...this.status.lastUpdated, [path]: date } });
  }
  public getLastUpdated(path: keyof T): number | null {
    return this.status.lastUpdated[path];
  }

  public async callApi<K extends keyof T>(
    path: K,
    params: T[K] extends DataApiFunc<S, infer X, any> ? X : never
  ): Promise<T[K] extends DataApiFunc<S, any, infer X> ? X : never> {
    let session: HttpSessionObject<S> = null;
    let err: any = null;
    try {
      if (this.deps.session) session = await this.deps.session.requestSession();
      this.changeStatus({ status: 'In Use', inQueue: this.status.inQueue + 1 });
      return await this.api[path]({ log: this.logger, session }, params);
    } catch (error) {
      err = error;
    } finally {
      if (session && !session.wasReleased) session.release();
      this.changeStatus({
        status: this.status.inQueue === 1 ? 'Ready' : 'In Use',
        inQueue: this.status.inQueue - 1,
        lastTouched: { ...this.status.lastTouched, [path]: Date.now() },
      });
      if (err) throw err;
    }
  }
}
