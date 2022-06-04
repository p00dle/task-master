import type { DataApi } from '../data-api';
import type { TaskerLogger } from './logger';

export type DataApiType<T> = T extends { api: infer X } ? X : never;

export interface StepTaskArg<
  S extends Record<string, DataApi<any, any>>,
  T extends Record<string, DataApi<any, any>>,
  L
> {
  state: L;
  setTargetLastUpdated: <N extends keyof T, P extends keyof DataApiType<T[N]>>(
    dataSourceName: N,
    path: P,
    date: number | null
  ) => void;
  setSourceLastUpdated: <N extends keyof S, P extends keyof DataApiType<S[N]>>(
    dataSourceName: N,
    path: P,
    date: number | null
  ) => void;
  getTargetLastUpdated: <N extends keyof T, P extends keyof DataApiType<T[N]>>(
    dataSourceName: N,
    path: P
  ) => number | null;
  getSourceLastUpdated: <N extends keyof S, P extends keyof DataApiType<S[N]>>(
    dataSourceName: N,
    path: P
  ) => number | null;
  getFromSource: <N extends keyof S, P extends keyof S[N]['api']>(
    source: N,
    path: P,
    params: Parameters<S[N]['api'][P]>[1]
  ) => ReturnType<S[N]['api'][P]>;
  sendToTarget: <N extends keyof T, P extends keyof T[N]['api']>(
    target: N,
    path: P,
    params: Parameters<T[N]['api'][P]>[1]
  ) => ReturnType<T[N]['api'][P]>;
  abort: symbol;
  retry: symbol;
  continue: symbol;
  finish: symbol;
  log: TaskerLogger;
  retries: number;
  waitFor: <T>(promise: Promise<T>) => Promise<T>;
}

export type StepFn<S extends Record<string, DataApi<any, any>>, T extends Record<string, DataApi<any, any>>, L> = (
  task: StepTaskArg<S, T, L>
) => Promise<void | symbol>;

export interface TaskOptions<
  S extends Record<string, DataApi<any, any>>,
  T extends Record<string, DataApi<any, any>>,
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
