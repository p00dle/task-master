import { HttpSessionObject } from '@kksiuda/http-session';
import { TaskMasterLogger, Unsubscribe } from './types';

export type DataSourceFunction = (session: HttpSessionObject<any>, params: any) => Promise<any>;

export interface DataSourceType {
  get: DataSourceFunction;
  set: DataSourceFunction;
}

export interface DataSource<
  T extends Record<string, any>,
  SN extends keyof T,
  G extends undefined | Record<string, (session: HttpSessionObject<T[SN]>, params?: any) => Promise<any>>,
  S extends undefined | Record<string, (session: HttpSessionObject<T[SN]>, params?: any) => Promise<any>>
> {
  session?: SN;
  get?: G;
  set?: S;
}

export interface DataSourceStatus {
  name: string;
  sourceLastUpdated: Record<string, number | null>;
  sourceLastTouched: Record<string, number | null>;
  targetLastUpdated: Record<string, number | null>;
  targetLastTouched: Record<string, number | null>;
}

type StatusChangeListener = (status: DataSourceStatus) => any;
type AllStatusChangeListener = (status: DataSourceStatus[]) => any;

export class DataSourceWrapper {
  protected sourceLastUpdated: Record<string, number | null> = {};
  protected sourceLastTouched: Record<string, number | null> = {};
  protected targetLastUpdated: Record<string, number | null> = {};
  protected targetLastTouched: Record<string, number | null> = {};
  protected listeners: StatusChangeListener[] = [];
  constructor(
    protected name: string,
    protected dataSource: DataSource<any, any, any, any>,
    protected sessionRegistrar: { requestSession: (name: string) => Promise<HttpSessionObject<any>> },
    protected logger: TaskMasterLogger
  ) {
    for (const source of dataSource.get ? Object.keys(dataSource.get) : []) {
      this.sourceLastTouched[source] = null;
      this.sourceLastUpdated[source] = null;
    }
    for (const target of dataSource.set ? Object.keys(dataSource.set) : []) {
      this.targetLastTouched[target] = null;
      this.targetLastUpdated[target] = null;
    }
  }
  public setTargetLastUpdated(path: string, date: number | null) {
    this.targetLastUpdated[path] = date;
    const dateStr = typeof date === 'number' ? new Date(date).toString() : 'null';
    this.logger.debug('Target last updated set to ' + dateStr);
    this.emitStatusChange();
  }
  public setSourceLastUpdated(path: string, date: number | null) {
    this.sourceLastUpdated[path] = date;
    const dateStr = typeof date === 'number' ? new Date(date).toString() : 'null';
    this.logger.debug('Source last updated set to ' + dateStr);
    this.emitStatusChange();
  }
  public getTargetLastUpdated(path: string): number | null {
    return this.targetLastUpdated[path];
  }
  public getSourceLastUpdated(path: string): number | null {
    return this.sourceLastUpdated[path];
  }

  public async set(path: string, value: any) {
    let err: any = null;
    let session: undefined | HttpSessionObject<any> = undefined;
    try {
      if (!this.dataSource.set || !this.dataSource.set[path]) {
        throw new TypeError(`set ${path} not defined`);
      }
      session = this.dataSource.session
        ? await this.sessionRegistrar.requestSession(this.dataSource.session)
        : undefined;
      return await this.dataSource.set[path](session, value);
    } catch (error) {
      err = error;
    } finally {
      if (session && !session.wasReleased) session.release();
      this.targetLastTouched[path] = Date.now();
      this.emitStatusChange();
      if (err) throw err;
    }
  }
  public async get(path: string, value: any) {
    let err: any = null;
    let session: undefined | HttpSessionObject<any> = undefined;
    try {
      if (!this.dataSource.get || !this.dataSource.get[path]) {
        throw new TypeError(`set ${path} not defined`);
      }
      session = this.dataSource.session
        ? await this.sessionRegistrar.requestSession(this.dataSource.session)
        : undefined;
      return await this.dataSource.get[path](session, value);
    } catch (error) {
      err = error;
    } finally {
      if (session && !session.wasReleased) session.release();
      this.sourceLastTouched[path] = Date.now();
      this.emitStatusChange();
      if (err) throw err;
    }
  }
  protected makeStatusData(): DataSourceStatus {
    return {
      name: this.name,
      sourceLastUpdated: this.sourceLastUpdated,
      sourceLastTouched: this.sourceLastTouched,
      targetLastUpdated: this.targetLastUpdated,
      targetLastTouched: this.targetLastTouched,
    };
  }
  protected emitStatusChange() {
    const statusData = this.makeStatusData();
    this.listeners.forEach((fn) => fn(statusData));
  }
  public subscribeToStatusChange(listener: StatusChangeListener): Unsubscribe {
    this.listeners.push(listener);
    listener(this.makeStatusData());
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }
}

export class DataSourceRegistrar {
  protected names: string[] = [];
  protected dataSources: Record<string, DataSourceWrapper> = {};
  protected dataSourcesStatuses: Record<string, DataSourceStatus> = {};
  protected listeners: AllStatusChangeListener[] = [];
  protected unsubscribers: Unsubscribe[] = [];
  protected logger: TaskMasterLogger;
  constructor(
    protected sessionRegistrar: { requestSession: (name: string) => Promise<HttpSessionObject<any>> },
    logger: TaskMasterLogger
  ) {
    this.logger = logger.namespace('Data Source');
  }
  public subscribeToStatusChange(listener: AllStatusChangeListener) {
    this.listeners.push(listener);
    listener(this.names.map((name) => this.dataSourcesStatuses[name]));
    return () => {
      const index = this.listeners.findIndex((fn) => fn === listener);
      if (index >= 0) this.listeners.splice(index, 1);
      if (this.listeners.length === 0) {
        this.unsubscribers.forEach((fn) => fn());
        this.unsubscribers = [];
      }
    };
  }
  public register(name: string, dataSource: DataSource<any, any, any, any>): this {
    if (this.dataSources[name]) return this;
    this.names.push(name);
    this.dataSources[name] = new DataSourceWrapper(
      name,
      dataSource,
      this.sessionRegistrar,
      this.logger.namespace(name)
    );
    this.unsubscribers.push(
      this.dataSources[name].subscribeToStatusChange((status) => {
        this.dataSourcesStatuses[name] = status;
        const statuses = this.names.map((name) => this.dataSourcesStatuses[name]);
        this.listeners.forEach((fn) => fn(statuses));
      })
    );
    return this;
  }
  public get(dataSource: string, path: string, params: any) {
    return this.dataSources[dataSource].get(path, params);
  }
  public set(dataSource: string, path: string, params: any) {
    return this.dataSources[dataSource].set(path, params);
  }
  public setTargetLastUpdated(dataSource: string, path: string, date: number | null) {
    this.dataSources[dataSource].setTargetLastUpdated(path, date);
  }
  public setSourceLastUpdated(dataSource: string, path: string, date: number | null) {
    this.dataSources[dataSource].setSourceLastUpdated(path, date);
  }
  public getTargetLastUpdated(dataSource: string, path: string): number | null {
    return this.dataSources[dataSource].getTargetLastUpdated(path);
  }
  public getSourceLastUpdated(dataSource: string, path: string): number | null {
    return this.dataSources[dataSource].getSourceLastUpdated(path);
  }
}
