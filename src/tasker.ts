import type { StatusTypeListener, TaskerOptions, TaskerStatus } from './types/tasker';
import type { LogStore } from './log-store';
import type { Unsubscribe } from './types/unsubscribe';
import type { CredentialsData } from './types/credentials';
import type { TaskerConfig } from './tasker-config';
import type { SessionDeps } from './types/session';
import type { DataApiDeps } from './types/data-api';

import { UtilityClass } from './lib/UtilityClass';
import { Credentials } from './credentials';
import { Session } from './sessions';
import { DataApi } from './data-api';
import { Task } from './task';
import { TaskerLogger } from './types/logger';
import * as http from 'http';
import { normalizeTaskerOptions } from './tasker-options';
import { getLogStoreLogger } from './logging';
import { createWriteStream } from 'node:fs';
import { asyncPipeline } from './lib/asyncPipeline';
import { errorCallBackPromise } from './lib/errorCallbackPromise';
import { createGuiServer } from './gui-server';

export class Tasker extends UtilityClass<TaskerStatus> {
  public logStore: LogStore;
  public logger: TaskerLogger;
  public isShutdown = false;

  protected credentials = {} as Record<string, Credentials>;
  protected dependencies = {} as Record<string, any>;
  protected sessions = {} as Record<string, Session>;
  protected sources = {} as Record<string, DataApi>;
  protected targets = {} as Record<string, DataApi>;
  protected tasks = {} as Record<string, Task>;
  protected statusTypeListeners = [] as StatusTypeListener<any>[];
  protected status: TaskerStatus;
  protected dumpLogsOnExitToFilename: string | null;
  protected logHttpRequests: boolean;
  protected forceStartTasks: boolean;
  protected logStatusChanges: boolean;
  protected guiServer: http.Server | null = null;

  constructor(config: TaskerConfig, options?: 'manual' | 'prod' | 'debug' | TaskerOptions) {
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
    this.importConfig(config);
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

  public runTaskOnce(name: string, params: any): Promise<unknown> {
    return this.tasks[name as string].execute(params);
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

  protected importConfig(taskerConfig: TaskerConfig) {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore TaskerConfig#serialize should only be used here, hence why it is protected
    const config = taskerConfig.serialize();

    for (const [name, envVars] of Object.entries(config.credentials)) {
      const logger = this.logger.namespace('Credentials').namespace(name);
      this.credentials[name] = new Credentials(name, envVars, logger);
    }

    for (const [name, dep] of Object.entries(config.dependencies)) {
      this.dependencies[name] = dep;
    }

    for (const [name, { deps, opts }] of Object.entries(config.sessions)) {
      const getDependencies = async (): Promise<SessionDeps> => {
        const output: SessionDeps = {};
        if (deps.credentials) {
          output.credentials = this.credentials[deps.credentials].getCredentials();
          output.validateCredentials = (valid) => this.credentials[deps.credentials].setValid(valid);
        }
        if (deps.parent) {
          output.parentSession = await this.sessions[deps.parent].requestSession();
        }
        return output;
      };
      const logger = this.logger.namespace('Session').namespace(name);
      this.sessions[name] = new Session(name, opts, getDependencies, logger, this.logHttpRequests);
    }

    for (const type of ['sources', 'targets'] as const) {
      for (const [name, { deps, opts }] of Object.entries(config[type])) {
        const getDependencies = async (): Promise<DataApiDeps> => {
          const output: DataApiDeps = {};
          if (deps.dependencies) {
            output.dependencies = {};
            for (const dep of deps.dependencies) {
              output.dependencies[dep] = this.dependencies[dep];
            }
          }
          if (deps.session) {
            output.session = await this.sessions[deps.session].requestSession();
          }
          return output;
        };
        const logger = this.logger.namespace(type === 'sources' ? 'Source' : 'Target').namespace(name);
        this[type][name] = new DataApi(name, opts, getDependencies, logger);
      }
    }

    for (const [name, { opts, steps }] of Object.entries(config.tasks)) {
      const logger = this.logger.namespace('Task').namespace(name);
      this.tasks[name] = new Task(name, opts, steps, this.sources, this.targets, this.dependencies, logger);
    }

    for (const type of ['credentials', 'sessions', 'sources', 'targets', 'tasks'] as const) {
      for (const name of Object.keys(config[type])) {
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
          if (isApi) {
            status.apiType = type === 'sources' ? 'source' : 'target';
          }
          const aliasType = isApi ? 'apis' : type;
          const index = this.status[aliasType].findIndex((x: { name: string }) => x.name === status.name);
          if (index >= 0) {
            this.status[aliasType][index] = status;
          } else {
            this.status[aliasType].push(status);
          }
          this.emitter.emit('status-change-' + aliasType, this.status[aliasType]);
        });
      }
    }
  }
}
