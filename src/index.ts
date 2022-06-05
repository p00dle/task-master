import type { TaskerOptions } from './types/tasker-options';
import { Tasker } from './tasker';
import { Task } from './task';
import { DataApi } from './data-api';
import { Session } from './session';
import { Credentials } from './credentials';
import { MemoryStore } from './memory-store';

export const tasker = {
  start: (tasks: Task<any, any, any>[], options?: 'manual' | 'prod' | 'debug' | TaskerOptions) =>
    new Tasker(tasks, options),
};

export { Task, DataApi, Session, Credentials, MemoryStore };

/*
TODO:
- register dependencies for logging and status updates; will need another tab in the client and a uniform interface for status (maybe re-use session's)
*/
