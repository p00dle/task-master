import type { TaskerLogger } from './types/logger';
import type { HttpSessionObject, Session } from './session';
import { UtilityClass } from './lib/UtilityClass';
import { noOpLogger } from './lib/noOpLogger';

export type DataApiFunc<S, A, T> = (
  dependencies: [S] extends [void] ? { log: TaskerLogger } : { log: TaskerLogger; session: HttpSessionObject<S> },
  args: A
) => Promise<T>;

export interface DataApiStatus<T> {
  name: string;
  status: 'In Use' | 'Ready';
  inQueue: number;
  lastUpdated: Record<keyof T, number | null>;
  lastTouched: Record<keyof T, number | null>;
  apiType?: 'source' | 'target';
}

type DataApiFuncParams<F> = F extends (deps: any, arg: infer X) => any ? X : never;
type DataApiFuncReturn<F> = F extends (...args: any[]) => Promise<infer X> ? X : never;

export interface DataApiOptions<S, T extends DataApiOptionsType<S>> {
  name: string;
  session?: S;
  api: T;
}

export type DataApiOptionsType<S> = S extends Session<infer X, any, any>
  ? Record<string, DataApiFunc<X, any, any>>
  : Record<string, DataApiFunc<void, any, any>>;

export class DataApi<S extends Session<any, any, any>, T extends DataApiOptionsType<S>> extends UtilityClass<
  DataApiStatus<T>
> {
  public name: string;
  public status: DataApiStatus<T>;
  public logger: TaskerLogger = noOpLogger;
  public session?: S;
  public api: T;
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

  public async callApi<K extends keyof T>(path: K, params: DataApiFuncParams<T[K]>): Promise<DataApiFuncReturn<T[K]>> {
    let session: HttpSessionObject<S> | undefined = undefined;
    let err: any = null;
    let result: DataApiFuncReturn<T[K]> | undefined = undefined;
    try {
      if (this.session) {
        session = await this.session.requestSession();
        this.changeStatus({ status: 'In Use', inQueue: this.status.inQueue + 1 });
        result = await this.api[path]({ log: this.logger, session } as unknown as { log: TaskerLogger }, params);
      } else {
        this.changeStatus({ status: 'In Use', inQueue: this.status.inQueue + 1 });
        result = await this.api[path]({ log: this.logger }, params);
      }
    } catch (error) {
      err = error;
    } finally {
      if (session && !session.wasReleased) session.release();
      this.changeStatus({
        status: this.status.inQueue === 1 ? 'Ready' : 'In Use',
        inQueue: this.status.inQueue - 1,
        lastTouched: { ...this.status.lastTouched, [path]: Date.now() },
      });
    }
    if (err) throw err;
    return result as DataApiFuncReturn<T[K]>;
  }
}
