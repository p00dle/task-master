import type { DataApiOptions } from './data-api';
import type { TaskerLogger } from './logger';

export interface TaskDeps {
  s: Record<string, DataApiOptions>;
  t: Record<string, DataApiOptions>;
  d: Record<string, any>;
}

export interface StepTaskArg<D extends TaskDeps = TaskDeps> {
  setTargetLastUpdated: <N extends keyof D['t'], P extends keyof D['t'][N]>(
    dataSourceName: N,
    path: P,
    date: number | null
  ) => void;
  setSourceLastUpdated: <N extends keyof D['s'], P extends keyof D['s'][N]>(
    dataSourceName: N,
    path: P,
    date: number | null
  ) => void;
  getTargetLastUpdated: <N extends keyof D['t'], P extends keyof D['t'][N]>(
    dataSourceName: N,
    path: P
  ) => number | null;
  getSourceLastUpdated: <N extends keyof D['s'], P extends keyof D['s'][N]>(
    dataSourceName: N,
    path: P
  ) => number | null;
  getFromSource: <N extends keyof D['s'], P extends keyof D['s'][N]>(
    source: N,
    path: P,
    params: Parameters<D['s'][N][P]>[1]
  ) => ReturnType<D['s'][N][P]>;
  sendToTarget: <N extends keyof D['t'], P extends keyof D['t'][N]>(
    target: N,
    path: P,
    params: Parameters<D['t'][N][P]>[1]
  ) => ReturnType<D['t'][N][P]>;
  abort: symbol;
  retry: symbol;
  continue: symbol;
  finish: symbol;
  log: TaskerLogger;
  dependencies: D['d'];
  retries: number;
  waitFor: <T>(promise: Promise<T>) => Promise<T>;
}

export type StepFn<D extends TaskDeps = TaskDeps, P = any, R = any> = (task: StepTaskArg<D>, params: P) => Promise<R>;

export interface TaskOptions<
  DAS extends Record<string, DataApiOptions> = any,
  DAT extends Record<string, DataApiOptions> = any,
  DEPS extends Record<string, any> = any,
  S extends keyof DAS = any,
  T extends keyof DAT = any,
  D extends keyof DEPS = any
> {
  sources?: S[];
  targets?: T[];
  dependencies?: D[];
  schedule?: string;
  interval?: number;
  continueInterval?: number;
  retry?: number;
}

export interface TaskStatus {
  name: string;
  status: 'ready' | 'running' | 'stopping' | 'error' | 'scheduled' | 'completed' | 'stopped';
  step: string | null;
  lastExecuted: number | null;
  lastError: number | null;
  error: string | null;
}
