import type { Session } from '../sessions';
import { TaskerLogger } from './logger';
import { HttpSessionObject } from './session';

export type DataApiDeps<S> = { session?: Session<S, any, any> };
export type DataApiFunc<S, A, T> = (
  dependencies: { log: TaskerLogger; session: HttpSessionObject<S> },
  args: A
) => Promise<T>;
export type DataApiOptions<S> = Record<string, DataApiFunc<S, any, any>>;

export interface DataApiStatus<T> {
  name: string;
  status: 'In Use' | 'Ready';
  inQueue: number;
  lastUpdated: Record<keyof T, number | null>;
  lastTouched: Record<keyof T, number | null>;
}

export interface DataApiDepsOptions<S, D> {
  session?: S;
  dependencies?: D[];
}
