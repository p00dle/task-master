import type { TaskerLogger } from './types/logger';
import type { HttpSessionObject, Session } from './session';
import { UtilityClass } from './lib/UtilityClass';
import { noOpLogger } from './lib/noOpLogger';

type DataApiDeps<S> = [S] extends [void] ? { log: TaskerLogger } : { log: TaskerLogger; session: HttpSessionObject<S> };

export type DataApiFunc<S, A, T> = (dependencies: DataApiDeps<S>, args: A) => Promise<T>;

export interface DataApiStatus<T, T2> {
  name: string;
  status: 'In Use' | 'Ready';
  inQueue: number;
  sourcesLastUpdated: Record<keyof T, number | null>;
  sourcesLastTouched: Record<keyof T, number | null>;
  targetsLastUpdated: Record<keyof T2, number | null>;
  targetsLastTouched: Record<keyof T2, number | null>;
}

type DataApiFuncParams<F> = F extends (deps: any, arg: infer X) => any ? X : never;
type DataApiFuncReturn<F> = F extends (...args: any[]) => Promise<infer X> ? X : never;

export interface DataApiOptions<S, T extends DataApiOptionsType<S>, T2 extends DataApiOptionsType<S>> {
  name: string;
  session?: S;
  sources?: T;
  targets?: T2;
}

export type DataApiOptionsType<S> = S extends Session<infer X, any, any>
  ? Record<string, DataApiFunc<X, any, any>>
  : Record<string, DataApiFunc<void, any, any>>;

export class DataApi<
  S extends Session<any, any, any>,
  T extends DataApiOptionsType<S>,
  T2 extends DataApiOptionsType<S>
> extends UtilityClass<DataApiStatus<T, T2>> {
  public name: string;
  public status: DataApiStatus<T, T2>;
  public logger: TaskerLogger = noOpLogger;
  public session?: S;
  public sources?: T;
  public targets?: T2;
  constructor(options: DataApiOptions<S, T, T2>) {
    super();
    this.name = options.name;
    this.session = options.session;
    this.sources = options.sources;
    this.targets = options.targets;
    this.status = {
      name: this.name,
      sourcesLastTouched: {} as Record<keyof T, number | null>,
      sourcesLastUpdated: {} as Record<keyof T, number | null>,
      targetsLastTouched: {} as Record<keyof T2, number | null>,
      targetsLastUpdated: {} as Record<keyof T2, number | null>,
      status: 'Ready',
      inQueue: 0,
    };
    if (this.sources) {
      for (const name of Object.keys(this.sources) as (keyof T)[]) {
        this.status.sourcesLastTouched[name] = null;
        this.status.sourcesLastUpdated[name] = null;
      }
    }
    if (this.targets) {
      for (const name of Object.keys(this.targets) as (keyof T2)[]) {
        this.status.targetsLastTouched[name] = null;
        this.status.targetsLastUpdated[name] = null;
      }
    }
  }

  public register(logger: TaskerLogger) {
    this.logger = logger;
  }
  public setSourceLastUpdated(path: keyof T, date: number | null) {
    this.logger.debug(
      `Source ${String(path)} last updated set to ${typeof date === 'number' ? new Date(date).toString() : 'null'}`
    );
    this.changeStatus({ sourcesLastUpdated: { ...this.status.sourcesLastUpdated, [path]: date } });
  }
  public getSourceLastUpdated(path: keyof T): number | null {
    return this.status.sourcesLastUpdated[path];
  }

  public setTargetLastUpdated(path: keyof T2, date: number | null) {
    this.logger.debug(
      `Target ${String(path)} last updated set to ${typeof date === 'number' ? new Date(date).toString() : 'null'}`
    );
    this.changeStatus({ targetsLastUpdated: { ...this.status.targetsLastUpdated, [path]: date } });
  }
  public getTargetLastUpdated(path: keyof T2): number | null {
    return this.status.targetsLastUpdated[path];
  }

  public callSourceApi<K extends keyof T>(path: K, params: DataApiFuncParams<T[K]>): Promise<DataApiFuncReturn<T[K]>> {
    if (!this.sources || !this.sources[path]) throw new TypeError(`Source ${String(path)} not defined`);
    return this.callApi(true, path, this.sources[path], params);
  }

  public callTargetApi<K extends keyof T2>(
    path: K,
    params: DataApiFuncParams<T2[K]>
  ): Promise<DataApiFuncReturn<T2[K]>> {
    if (!this.targets || !this.targets[path]) throw new TypeError(`Target ${String(path)} not defined`);
    return this.callApi(false, path, this.targets[path], params);
  }

  protected async callApi<P, R, I extends boolean>(
    isSource: I,
    path: I extends true ? keyof T : keyof T2,
    apiFn: (deps: DataApiDeps<S>, params: P) => Promise<R>,
    params: P
  ): Promise<R> {
    let session: HttpSessionObject<S> | undefined = undefined;
    let err: any = null;
    let result: R | undefined = undefined;
    try {
      if (this.session) {
        session = await this.session.requestSession();
        this.changeStatus({ status: 'In Use', inQueue: this.status.inQueue + 1 });
        result = await apiFn({ log: this.logger, session } as DataApiDeps<S>, params);
      } else {
        this.changeStatus({ status: 'In Use', inQueue: this.status.inQueue + 1 });
        result = await apiFn({ log: this.logger } as DataApiDeps<S>, params);
      }
    } catch (error) {
      err = error;
    } finally {
      if (session && !session.wasReleased) session.release();
      if (isSource) {
        this.changeStatus({
          status: this.status.inQueue === 1 ? 'Ready' : 'In Use',
          inQueue: this.status.inQueue - 1,
          sourcesLastTouched: { ...this.status.sourcesLastTouched, [path]: Date.now() },
        });
      } else {
        this.changeStatus({
          status: this.status.inQueue === 1 ? 'Ready' : 'In Use',
          inQueue: this.status.inQueue - 1,
          targetsLastTouched: { ...this.status.targetsLastTouched, [path]: Date.now() },
        });
      }
    }
    if (err) throw err;
    return result as R;
  }
}
