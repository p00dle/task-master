import type { TaskerLogger } from './types/logger';
import type { Dependency, DependencyType } from './types/dependency';

import { UtilityClass } from './lib/UtilityClass';
import { noOpLogger } from './lib/noOpLogger';

type DependencyTypes<D> = D extends Record<string, Dependency<any>>
  ? {
      [K in keyof D]: D[K] extends { requestResource: () => Promise<infer X> } ? X : never;
    }
  : never;

type DataApiDeps<D> = D extends Record<string, Dependency<any>>
  ? {
      log: TaskerLogger;
      requestResource: <R extends keyof D>(
        resource: R
      ) => Promise<D[R] extends { requestResource: () => Promise<infer X> } ? X : never>;
    }
  : { log: TaskerLogger };

export type DataApiFunc<D, A, T> = (dependencies: DataApiDeps<D>, args: A) => Promise<T>;

export interface DataApiStatus {
  usedAsSource: boolean;
  usedAsTarget: boolean;
  name: string;
  status: 'In Use' | 'Ready';
  inQueue: number;
  sourceLastUpdated: number | null;
  sourceLastTouched: number | null;
  targetLastUpdated: number | null;
  targetLastTouched: number | null;
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
> extends UtilityClass<DataApiStatus> {
  public name: string;
  public status: DataApiStatus;
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
      usedAsSource: false,
      usedAsTarget: false,
      name: this.name,
      sourceLastTouched: null,
      sourceLastUpdated: null,
      targetLastTouched: null,
      targetLastUpdated: null,
      status: 'Ready',
      inQueue: 0,
    };
  }

  public register(usedAs: 'sources' | 'targets', logger: TaskerLogger) {
    this.logger = logger;
    if (usedAs === 'sources') this.changeStatus({ usedAsSource: true });
    else this.changeStatus({ usedAsTarget: true });
  }
  public setSourceLastUpdated(date: number | null) {
    this.logger.debug(`Source last updated set to ${typeof date === 'number' ? new Date(date).toString() : 'null'}`);
    this.changeStatus({ sourceLastUpdated: date });
  }
  public getSourceLastUpdated(): number | null {
    return this.status.sourceLastUpdated;
  }

  public setTargetLastUpdated(date: number | null) {
    this.logger.debug(`Target last updated set to ${typeof date === 'number' ? new Date(date).toString() : 'null'}`);
    this.changeStatus({ targetLastUpdated: date });
  }
  public getTargetLastUpdated(): number | null {
    return this.status.targetLastUpdated;
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
          sourceLastTouched: Date.now(),
        });
      } else {
        this.changeStatus({
          status: this.status.inQueue === 1 ? 'Ready' : 'In Use',
          inQueue: this.status.inQueue - 1,
          targetLastTouched: Date.now(),
        });
      }
    }
    if (err) throw err;
    return result as R;
  }
}
