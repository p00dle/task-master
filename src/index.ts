import type { TaskerOptions } from './types/tasker';
import { Tasker } from './tasker';
import { TaskerConfig } from './tasker-config';

export const tasker = {
  run: (config: TaskerConfig, options?: 'manual' | 'prod' | 'debug' | TaskerOptions) => new Tasker(config, options),
  config: () => new TaskerConfig(),
};

/*
- add proper namespacing to logger / fix status change logging
- add logger to deps in api
- api deps need to be defined when used
- fix the depth problem; maybe remove TDEPS ? - got better after removing typing from runnner
- session seems to be getting +2 on queue every time a task is used; maybe not released?

*/
