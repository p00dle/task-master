import type { SessionObject } from './session';

export type DataApiDeps<S = any, D = any> = { session?: SessionObject<S>; dependencies?: D };
export type DataApiFunc<S, D, A, T> = (dependencies: DataApiDeps<S, D>, args: A) => Promise<T>;
export type DataApiOptions<S = any, D = any> = Record<string, DataApiFunc<S, D, any, any>>;

export interface DataApiStatus {
  name: string;
  status: 'In Use' | 'Ready';
  inQueue: number;
  lastUpdated: Record<string, number | null>;
  lastTouched: Record<string, number | null>;
}

export interface DataApiDepsOptions<S = any, D = any> {
  session?: S;
  dependencies?: D[];
}
