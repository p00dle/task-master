import type { TaskerLogger } from './types/logger';
import type { HttpSessionObject, Session } from './session';
import { UtilityClass } from './lib/UtilityClass';
import { noOpLogger } from './lib/noOpLogger';

export type DataApiFunc<S, A, T> = (
  dependencies: { log: TaskerLogger; session: HttpSessionObject<S> },
  args: A
) => Promise<T>;

export interface DataApiStatus<T> {
  name: string;
  status: 'In Use' | 'Ready';
  inQueue: number;
  lastUpdated: Record<keyof T, number | null>;
  lastTouched: Record<keyof T, number | null>;
}

export interface DataApiOptions<S, T extends Record<string, DataApiFunc<S, any, any>>> {
  name: string;
  session?: Session<S, any, any>;
  api: T;
}

export class DataApi<S, T extends Record<string, DataApiFunc<S, any, any>>> extends UtilityClass<DataApiStatus<T>> {
  public name: string;
  public status: DataApiStatus<T>;
  public logger: TaskerLogger = noOpLogger;
  public session: Session<S, any, any>;
  protected api: T;
  constructor(options: DataApiOptions<S, T>) {
    super();
    this.name = options.name;
    this.session = options.session;
    this.api = options.api;
    this.status = {
      name: this.name,
      lastTouched: {} as Record<keyof T, number | null>,
      lastUpdated: {} as Record<keyof T, number | null>,
      status: 'Ready',
      inQueue: 0,
    };
    for (const apiName of Object.keys(this.api) as (keyof T)[]) {
      this.status.lastTouched[apiName] = null;
      this.status.lastUpdated[apiName] = null;
    }
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
      if (this.session) session = await this.session.requestSession();
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
