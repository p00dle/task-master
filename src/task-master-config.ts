/* eslint-disable @typescript-eslint/no-unused-vars */
import { HttpSessionObject } from '@kksiuda/http-session';
import { Credentials } from './credentials';
import { DataSource, DataSourceFunction, DataSourceRegistrar } from './data-sources';
import { createGuiRouter } from './gui-router';
import { openBrowser } from './lib/openBrowser';
import { SessionConstructor, SessionsRegistrar } from './sessions';
import { TaskParams, TaskRegistrar } from './task';
import * as http from 'node:http';
import { TaskMasterLogger, Unsubscribe } from './types';
import { consoleLogConsumerFactory, LogConsumer, Logger } from '@kksiuda/logger';
import { GetLogsParams, Log, LogStore, NoOpLogStore } from './log-store';
import { createWriteStream } from 'node:fs';
import { asyncPipeline } from './lib/asyncPipeline';
import { errorCallBackPromise } from './lib/errorCallbackPromise';


export class TaskMasterConfig<
  CN extends string = never,
  ST = Record<never, unknown>,
  DSG extends Record<string, Record<string, DataSourceFunction>> = Record<never, Record<never, DataSourceFunction>>,
  DSS extends Record<string, Record<string, DataSourceFunction>> = Record<never, Record<never, DataSourceFunction>>,
  DEPS extends Record<string, any> = Record<never, any>
> {
  protected creds = {} as Record<CN, Credentials>;
  protected sessions =: SessionsRegistrar;
  protected dataSources: DataSourceRegistrar;
  protected isShutdown = false;
  protected dependencies = {} as DEPS;
  protected logger: TaskMasterLogger;
  protected tasks: TaskRegistrar;
  protected forceStartTasks = true;
  protected guiServer: http.Server | null = null;
  protected unsubscribers: Unsubscribe[] = [];
  protected listeners: { type: StatusType; listener: StatusListener }[] = [];
  protected statusData: AllStatusData = {
    credentials: [],
    sessions: [],
    dataSources: [],
    tasks: [],
  };
  public subscribeToStatusChange(type: StatusType, listener: StatusListener): Unsubscribe {
    const listenerWithType = { type, listener };
    this.listeners.push(listenerWithType);
    listener(this.statusData[type]);
    return () => {
      const index = this.listeners.indexOf(listenerWithType);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }
  public subscribeToLogs(params: GetLogsParams, listener: (data: Log[]) => any): Unsubscribe {
    return this.logStore.subscribe(params, listener);
  }

  protected changeStatus(type: StatusType, data: any[]) {
    this.statusData[type] = data;
    this.listeners.filter((x) => x.type === type).forEach((x) => x.listener(this.statusData[type]));
  }

  // public setCredentials(name: CN, username: string, password: string) {
  //   this.credentials.setCredentials(name, username, password);
  // }

  public invalidateSession(name: keyof ST) {
    this.sessions.invalidateSession(name as string);
  }

  public startTask(name?: string) {
    return this.tasks.forceStart(name);
  }

  public stopTask(name?: string) {
    return this.tasks.forceStop(name);
  }
  public async shutdown() {
    this.isShutdown = true;
    try {
      this.logStore.shutdown();
      this.unsubscribers.forEach((fn) => fn());
      await this.sessions.shutdown();
      await this.tasks.forceStop();
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
  constructor(config: TaskMasterConfig = {}) {
    const params = normalizeConfig(config);
    const { dumpLogsOnExitToFilename, forceStartTasks } = params;
    const { shouldLog, logsFilename, logConsole, logHttpRequests, logLevel, logConsumer, logStore } = params;
    const {
      useArchive,
      archiveLogsAfterMs,
      retainArchivedLogs,
      archiveLogsIntervalMs,
      logMemoryLimitMb,
      logMemoryPurgeRatio,
    } = params;
    if (dumpLogsOnExitToFilename) {
      this.dumpLogsOnExitToFilename = dumpLogsOnExitToFilename;
    }
    this.forceStartTasks = forceStartTasks;
    this.logStore =
      shouldLog && logStore
        ? new LogStore(
            useArchive,
            archiveLogsAfterMs,
            retainArchivedLogs,
            archiveLogsIntervalMs,
            logMemoryLimitMb,
            logMemoryPurgeRatio
          )
        : new NoOpLogStore();
    const consoleLogConsumer = logConsole ? consoleLogConsumerFactory() : () => undefined;
    const consoleLogConsumerWrapper = logConsole
      ? ({ timestamp, namespace, logLevel, message, details }: Log) => {
          consoleLogConsumer({ timestamp, namespace, logLevel, payload: details ? `${message}\n${details}` : message });
        }
      : () => undefined;
    this.logger = new Logger<{ message: string; details?: string }>({
      logLevel,
      consumer: shouldLog
        ? (log) => {
            if (logConsumer) logConsumer(log);
            const normalizedLog = {
              timestamp: log.timestamp,
              namespace: log.namespace,
              logLevel: log.logLevel,
              message: log.payload.message,
              details: log.payload.details || '',
            };
            consoleLogConsumerWrapper(normalizedLog);
            this.logStore.addLog(normalizedLog);
          }
        : () => undefined,
    }).namespace('', (message: string, details?: string) => ({ message, details }));

    // this.credentials = new CredentialsRegistrar(this.logger);
    this.sessions = new SessionsRegistrar(this.creds, this.logger, logHttpRequests);
    this.dataSources = new DataSourceRegistrar(this.sessions, this.logger);
    this.tasks = new TaskRegistrar(this.dataSources, this.dependencies, this.logger);
    this.unsubscribers.push(this.credentials.subscribeToStatusChange((data) => this.changeStatus('credentials', data)));
    this.unsubscribers.push(this.sessions.subscribeToStatusChange((data) => this.changeStatus('sessions', data)));
    this.unsubscribers.push(this.dataSources.subscribeToStatusChange((data) => this.changeStatus('dataSources', data)));
    this.unsubscribers.push(this.tasks.subscribeToStatusChange((data) => this.changeStatus('tasks', data)));

    const { startGui, guiPort, openInBrowser, localConnectionsOnly, longPollTimeout } = params;
    if (startGui) {
      const router = createGuiRouter({
        logStore: this.logStore,
        subscribeToStatusChange: this.subscribeToStatusChange.bind(this),
        shutdown: this.shutdown.bind(this),
        onSetCredential: this.credentials.setCredentials.bind(this.credentials),
        onInvalidateSession: this.sessions.invalidateSession.bind(this.sessions),
        onForceStopTask: this.tasks.forceStop.bind(this.tasks),
        onStartTask: this.tasks.forceStart.bind(this.tasks),
        logsFilename,
        localConnectionsOnly,
        longPollTimeout,
      });
      const server = http.createServer(router);
      this.guiServer = server;
      server.on('listening', () => {
        if (this.isShutdown) {
          server.close();
        } else {
          this.logger.info(`Server started; GUI available at http://localhost:${guiPort}`);
          if (openInBrowser) openBrowser(`http://localhost:${guiPort}`);
        }
      });
      server.on('error', (err) => console.error(err));
      server.listen(guiPort, 'localhost');
    }
    return this;
  }

  public credentials<N extends string>(
    name: N,
    envVars?: { username?: string; password?: string }
  ): TaskMaster<CN | N, ST, DSG, DSS, DEPS> {
    this.creds[name as unknown as CN] = new Credentials(name, envVars, this.logger);
    return this as TaskMaster<CN | N, ST, DSG, DSS, DEPS>;
  }

  public registerSession<N extends string, T>(
    name: N,
    Session: SessionConstructor<T>,
    options?: { parentSession?: keyof ST; credentials?: CN }
  ): TaskMaster<CN, ST & { [name in N]: T }, DSG, DSS, DEPS> {
    this.sessions.register(name, Session, options as { parentSession?: string; credentials?: string });
    return this as unknown as TaskMaster<CN, ST & { [name in N]: T }, DSG, DSS, DEPS>;
  }

  public registerDependency<N extends string, T>(name: N, value: T) {
    this.dependencies[name as keyof DEPS] = value as unknown as DEPS[keyof DEPS];
    return this as unknown as TaskMaster<CN, ST, DSG, DSS, DEPS & { [name in N]: T }>;
  }

  public registerDataSource<
    N extends string,
    SN extends keyof ST,
    G extends undefined | Record<string, (session: HttpSessionObject<ST[SN]>, params?: any) => Promise<any>>,
    S extends undefined | Record<string, (session: HttpSessionObject<ST[SN]>, params?: any) => Promise<any>>
  >(name: N, dataSource: DataSource<ST, SN, G, S>) {
    this.dataSources.register(name, dataSource);
    return this as unknown as TaskMaster<
      CN,
      ST,
      DSG & { [name in N]: G extends undefined ? never : G },
      DSS & { [name in N]: S extends undefined ? never : S },
      DEPS
    >;
  }

  protected _registerTask(name: string, defaultLocalState: any, task: TaskParams<any, any, any, any, any, any, any>) {
    this.tasks.register(name, task, defaultLocalState);
    if (this.forceStartTasks) this.tasks.forceStart(name);
    return this;
  }

  public registerTask<L>(name: string, defaultLocalState?: L) {
    return this._registerTask.bind(this, name, defaultLocalState) as <
      DSGN extends keyof DSG,
      DSSN extends keyof DSS,
      DEPSN extends keyof DEPS
    >(
      task: TaskParams<DSG, DSS, DSGN, DSSN, L, DEPS, DEPSN>
    ) => TaskMaster<CN, ST, DSG, DSS, DEPS>;
  }
}
