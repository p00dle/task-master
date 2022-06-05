import type { LogStore } from './log-store';
import type { Unsubscribe } from './types/unsubscribe';
import type { CredentialsData, CredentialsStatus } from './credentials';

import { UtilityClass } from './lib/UtilityClass';
import { Credentials } from './credentials';
import { HttpSessionStatusData, Session } from './session';
import { DataApi, DataApiStatus } from './data-api';
import { Task } from './task';
import { TaskerLogger } from './types/logger';
import * as http from 'http';
import { normalizeTaskerOptions } from './tasker-options';
import { getLogStoreLogger } from './logging';
import { createWriteStream } from 'node:fs';
import { asyncPipeline } from './lib/asyncPipeline';
import { errorCallBackPromise } from './lib/errorCallbackPromise';
import { createGuiServer } from './gui-server';
import { TaskStatus } from './types/task';
import { TaskerOptions } from './types/tasker-options';

export interface TaskerStatus {
  credentials: CredentialsStatus[];
  sessions: HttpSessionStatusData[];
  apis: DataApiStatus<any, any>[];
  tasks: TaskStatus[];
}

export interface StatusTypeListener<K extends keyof TaskerStatus> {
  type: K;
  listener: (data: TaskerStatus[K]) => any;
}

export class Tasker extends UtilityClass<TaskerStatus> {
  public logStore: LogStore;
  public logger: TaskerLogger;
  public isShutdown = false;

  protected credentials = {} as Record<string, Credentials>;
  protected dependencies = {} as Record<string, any>;
  protected sessions = {} as Record<string, Session<any, any, any>>;
  protected sources = {} as Record<string, DataApi<any, any, any>>;
  protected targets = {} as Record<string, DataApi<any, any, any>>;
  protected tasks = {} as Record<string, Task<any, any, any>>;
  protected statusTypeListeners = [] as StatusTypeListener<any>[];
  protected status: TaskerStatus;
  protected dumpLogsOnExitToFilename: string | null;
  protected logHttpRequests: boolean;
  protected forceStartTasks: boolean;
  protected logStatusChanges: boolean;
  protected guiServer: http.Server | null = null;

  constructor(tasks: Task<any, any, any>[], options?: 'manual' | 'prod' | 'debug' | TaskerOptions) {
    super();
    const params = normalizeTaskerOptions(options);
    this.dumpLogsOnExitToFilename = params.dumpLogsOnExitToFilename;
    this.forceStartTasks = params.forceStartTasks;
    this.logHttpRequests = params.logHttpRequests;
    this.logStatusChanges = params.logStatusChanges;
    const [logStore, logger] = getLogStoreLogger(params);
    this.logStore = logStore;
    this.logger = logger;
    this.status = {
      credentials: [],
      sessions: [],
      apis: [],
      tasks: [],
    };
    this.guiServer = createGuiServer(params, this);
    for (const task of tasks) this.registerTask(task);
    this.registerListeners();
  }

  public onPartialStatus<K extends keyof TaskerStatus>(typeListener: StatusTypeListener<K>): Unsubscribe {
    const { type, listener } = typeListener;
    this.emitter.on('status-change-' + type, listener);
    listener(this.status[typeListener.type]);
    return () => this.emitter.off('status-change-' + type, listener);
  }

  public async shutdown() {
    this.isShutdown = true;
    try {
      this.logStore.shutdown();
      await Promise.all(Object.values(this.sessions).map((sess) => sess.shutdown()));
      await Promise.all(Object.values(this.tasks).map((task) => task.forceStop()));
      if (this.dumpLogsOnExitToFilename) {
        const csvStream = this.logStore.getCsvStream();
        const fsWriteStream = createWriteStream(this.dumpLogsOnExitToFilename, { encoding: 'utf8' });
        await asyncPipeline(csvStream, fsWriteStream);
      }
      if (this.guiServer && this.guiServer.listening) {
        this.logger.debug('Shutting down server');
        const [serverClosePromise, cb] = errorCallBackPromise();
        this.guiServer.close(cb);
        await serverClosePromise;
        this.logger.info('Server shutdown');
      }
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }

  public start() {
    if (this.forceStartTasks) {
      Object.values(this.tasks).forEach((task) => task.forceStart());
    }
    return this;
  }

  public stopTask(name?: string) {
    if (name) {
      return this.tasks[name].forceStop();
    } else {
      return Promise.all(Object.values(this.tasks).map((task) => task.forceStop()));
    }
  }

  public startTask(name?: string) {
    if (name) {
      return this.tasks[name].forceStart();
    } else {
      return Promise.all(Object.values(this.tasks).map((task) => task.forceStart()));
    }
  }

  public invalidateSession(name?: string) {
    if (name) {
      return this.sessions[name].invalidateSession();
    } else {
      return Promise.all(Object.values(this.sessions).map((session) => session.invalidateSession()));
    }
  }

  public setCredentials(name: string, credentials: CredentialsData) {
    this.credentials[name].setCredentials(credentials);
  }

  protected registerTask(task: Task<any, any, any>) {
    if (this.tasks[task.name]) {
      if (this.tasks[task.name] !== task) {
        throw TypeError(`Unable to register more than one task under same name "${task.name}"`);
      }
    }
    this.tasks[task.name] = task;
    task.register(this.logger.namespace('Task').namespace(task.name));
    if (task.sources) {
      for (const api of Object.values(task.sources) as DataApi<any, any, any>[]) {
        this.registerApi('sources', api);
      }
    }
    if (task.targets) {
      for (const api of Object.values(task.targets) as DataApi<any, any, any>[]) {
        this.registerApi('targets', api);
      }
    }
  }

  protected registerApi(type: 'sources' | 'targets', api: DataApi<any, any, any>) {
    if (this[type][api.name]) {
      if (this[type][api.name] !== api) {
        throw TypeError(
          `Unable to register more than one ${type === 'sources' ? 'source' : 'target'} under same name: "${api.name}"`
        );
      }
    }
    this[type][api.name] = api;
    api.register(this.logger.namespace(type === 'sources' ? 'Source' : 'Target').namespace(api.name));
    if (api.dependencies) {
      for (const dep of Object.values(api.dependencies)) {
        if (dep instanceof Session) this.registerSession(dep);
      }
    }
  }

  protected registerSession(session: Session<any, any, any>) {
    if (this.sessions[session.name]) {
      if (this.sessions[session.name] !== session) {
        throw TypeError(`Unable to register more than one session under same name "${session.name}"`);
      }
    }
    this.sessions[session.name] = session;
    session.register(this.logger.namespace('Session').namespace(session.name), this.logHttpRequests);
    if (session.parentSession) this.registerSession(session.parentSession);
    if (session.credentials) this.registerCredentials(session.credentials);
  }

  protected registerCredentials(creds: Credentials) {
    if (this.credentials[creds.name]) {
      if (this.credentials[creds.name] !== creds) {
        throw TypeError(`Unable to register more than one credentials under same name "${creds.name}"`);
      }
    }
    this.credentials[creds.name] = creds;
    creds.register(this.logger.namespace('Credentials').namespace(creds.name));
  }

  protected registerListeners() {
    for (const type of ['credentials', 'sessions', 'sources', 'targets', 'tasks'] as const) {
      for (const name of Object.keys(this[type])) {
        this[type][name].onStatus((status) => {
          if (this.logStatusChanges && this[type][name].status !== undefined) {
            const currStatus = status.status;
            const prevStatus = this[type][name].status.status;
            if (currStatus !== prevStatus) {
              this[type][name].logger.debug(
                `Status: ${prevStatus} > ${currStatus}`,
                JSON.stringify({ ...status, type }, null, 2)
              );
            }
          }
          const isApi = type === 'sources' || type === 'targets';
          const aliasType = isApi ? 'apis' : type;
          const index = this.status[aliasType].findIndex((x: { name: string }) => x.name === status.name);
          if (index >= 0) {
            this.status[aliasType][index] = status;
          } else {
            (this.status[aliasType] as any[]).push(status);
          }
          this.emitter.emit('status-change-' + aliasType, this.status[aliasType]);
        });
      }
    }
  }
}
