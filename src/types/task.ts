import type { DataApi } from '../data-api';
import type { TaskerLogger } from './logger';

export type SourceDataApiType<T> = T extends { sources: infer X } ? X : never;
export type TargetDataApiType<T> = T extends { targets: infer X } ? X : never;

export interface StepTaskArg<
  S extends Record<string, DataApi<any, any, any>>,
  T extends Record<string, DataApi<any, any, any>>,
  L
> {
  state: L;
  setTargetLastUpdated: <N extends keyof T, P extends keyof TargetDataApiType<T[N]>>(
    dataSourceName: N,
    path: P,
    date: number | null
  ) => void;
  setSourceLastUpdated: <N extends keyof S, P extends keyof SourceDataApiType<S[N]>>(
    dataSourceName: N,
    path: P,
    date: number | null
  ) => void;
  getTargetLastUpdated: <N extends keyof T, P extends keyof TargetDataApiType<T[N]>>(
    dataSourceName: N,
    path: P
  ) => number | null;
  getSourceLastUpdated: <N extends keyof S, P extends keyof SourceDataApiType<S[N]>>(
    dataSourceName: N,
    path: P
  ) => number | null;
  getFromSource: <N extends keyof S, P extends keyof S[N]['sources']>(
    source: N,
    path: P,
    params: Parameters<S[N]['sources'][P]>[1]
  ) => ReturnType<S[N]['sources'][P]>;
  sendToTarget: <N extends keyof T, P extends keyof T[N]['targets']>(
    target: N,
    path: P,
    params: Parameters<T[N]['targets'][P]>[1]
  ) => ReturnType<T[N]['targets'][P]>;
  abort: symbol;
  retry: symbol;
  continue: symbol;
  finish: symbol;
  log: TaskerLogger;
  retries: number;
  waitFor: <T>(promise: Promise<T>) => Promise<T>;
}

export type StepFn<
  S extends Record<string, DataApi<any, any, any>>,
  T extends Record<string, DataApi<any, any, any>>,
  L
> = (task: StepTaskArg<S, T, L>) => Promise<void | symbol>;

export interface TaskOptions<
  S extends Record<string, DataApi<any, any, any>>,
  T extends Record<string, DataApi<any, any, any>>,
  L
> {
  name: string;
  steps: StepFn<S, T, L>[];
  sources?: S;
  targets?: T;
  state?: L;
  schedule?: string;
  interval?: number;
  continueInterval?: number;
  preserveState?: boolean;
  retry?: number;
}

export interface TaskStatus {
  name: string;
  status: 'Ready' | 'Running' | 'Stopping' | 'Error' | 'Scheduled' | 'Completed' | 'Stopped';
  step: string | null;
  lastExecuted: number | null;
  lastError: number | null;
  error: string | null;
}
