import type { TaskerLogger } from './types/logger';
import type { Dependency, DependencyType } from './types/dependency';

import { UtilityClass } from './lib/UtilityClass';
import { noOpLogger } from './lib/noOpLogger';

type DependencyTypes<D> = D extends Record<string, Dependency<any>>
  ? {
      [K in keyof D]: D[K] extends Dependency<infer X> ? X : never;
    }
  : never;

type DataApiDeps<D> = D extends Record<string, Dependency<any>>
  ? {
      log: TaskerLogger;
      requestResource: <R extends keyof D>(resource: R) => Promise<D[R] extends Dependency<infer X> ? X : never>;
    }
  : { log: TaskerLogger };

export type DataApiFunc<D, A, T> = (dependencies: DataApiDeps<D>, args: A) => Promise<T>;

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

export interface DataApiOptions<D, T extends DataApiOptionsType<D>, T2 extends DataApiOptionsType<D>> {
  name: string;
  dependencies?: D;
  resourceRequestTimeoutMs?: number;
  sources?: T;
  targets?: T2;
}

export type DataApiOptionsType<D> = D extends Record<string, Dependency<any>>
  ? Record<string, DataApiFunc<D, any, any>>
  : Record<string, DataApiFunc<void, any, any>>;

export class DataApi<
  D extends Record<string, Dependency<any>>,
  T extends DataApiOptionsType<D>,
  T2 extends DataApiOptionsType<D>
> extends UtilityClass<DataApiStatus<T, T2>> {
  public name: string;
  public status: DataApiStatus<T, T2>;
  public logger: TaskerLogger = noOpLogger;
  public dependencies?: D;
  public sources: T;
  public targets: T2;
  constructor(options: DataApiOptions<D, T, T2>) {
    super();
    this.name = options.name;
    this.dependencies = options.dependencies;
    this.sources = options.sources as T;
    this.targets = options.targets as T2;
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
    apiFn: (deps: DataApiDeps<D>, params: P) => Promise<R>,
    params: P
  ): Promise<R> {
    const requestedResources: DependencyType[] = [];
    const requestResource = async <R extends keyof DependencyTypes<D> & keyof D>(
      resource: R,
      timeoutMs?: number
    ): Promise<DependencyTypes<D>[R]> => {
      if (!this.dependencies || !this.dependencies[resource])
        throw new Error(`Dependency ${String(resource)} not registered`);
      const requestedResource = await this.dependencies[resource].requestResource(
        timeoutMs || this.dependencies[resource].defaultTimeoutMs
      );
      requestedResources.push(requestedResource);
      return requestedResource;
    };
    let err: any = null;
    let result: R | undefined = undefined;
    try {
      this.changeStatus({ status: 'In Use', inQueue: this.status.inQueue + 1 });
      const apiFnDeps = this.dependencies ? { log: this.logger, requestResource } : { log: this.logger };
      result = await apiFn(apiFnDeps as DataApiDeps<D>, params);
    } catch (error) {
      err = error;
    } finally {
      for (const resource of requestedResources) {
        if (!resource.wasReleased) await resource.release();
      }
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
