import type { DataApi } from '../data-api';
import type { TaskerLogger } from './logger';

export type DataApiType<T extends DataApi<any, any>> = T extends DataApi<any, infer X> ? X : never;
export type DataApiParam<T extends DataApi<any, any>, P extends keyof DataApiType<T>> = DataApiType<T>[P] extends (
  a: any,
  b: infer X
) => any
  ? X
  : never;
export type DataApiReturn<T extends DataApi<any, any>, P extends keyof DataApiType<T>> = DataApiType<T>[P] extends (
  a: any,
  b: any
) => infer X
  ? X
  : never;

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
  getFromSource: <N extends keyof S, P extends keyof DataApiType<S[N]>>(
    source: N,
    path: P,
    params: DataApiParam<S[N], P>
  ) => DataApiReturn<S[N], P>;
  sendToTarget: <N extends keyof T, P extends keyof DataApiType<T[N]>>(
    target: N,
    path: P,
    params: DataApiParam<T[N], P>
  ) => DataApiReturn<T[N], P>;
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
