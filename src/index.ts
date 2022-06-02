import type { TaskerOptions } from './types/tasker';
import { Tasker } from './tasker';
import { Task } from './task';
import { DataApi } from './data-api';
import { Session } from './sessions';
import { Credentials } from './credentials';

export const tasker = {
  start: (tasks: Task<any, any, any>[], options?: 'manual' | 'prod' | 'debug' | TaskerOptions) =>
    new Tasker(tasks, options),
};

export { Task, DataApi, Session, Credentials };
