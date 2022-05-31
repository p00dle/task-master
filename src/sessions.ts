import type { TaskMasterLogger, Unsubscribe } from './types';

import { HttpSession, HttpSessionObject, HttpSessionStatusData } from '@kksiuda/http-session';
import { CredentialsRegistrar } from './credentials';
import { Logger } from '@kksiuda/logger';
import { noOpLogger } from './lib/noOpLogger';

export interface SessionConstructor<T> {
  new (): HttpSession<T>;
}

export type SessionStatus = { name: string } & HttpSessionStatusData;

type SessionStatusListener = (data: SessionStatus) => any;
type AllHttpSessionsStatusListener = (data: SessionStatus[]) => any;

export class SessionWrapper {
  protected session: HttpSession<any>;
  protected unsubscribeFromCredentials: Unsubscribe | null = null;

  constructor(
    protected name: string,
    SessionClass: SessionConstructor<any>,
    protected logger: TaskMasterLogger,
    logHttpRequests: boolean
  ) {
    this.session = new SessionClass();
    this.session.logger = logHttpRequests ? this.logger : noOpLogger;
  }

  public subscribeToCredentials(credentials: CredentialsRegistrar, credentialsName: string) {
    this.unsubscribeFromCredentials = credentials.subscribe(credentialsName, (username, password) => {
      this.session.setParams({ username, password });
    });
  }

  public async shutdown() {
    if (this.unsubscribeFromCredentials) this.unsubscribeFromCredentials();
    this.logger.debug('Shutting session down');
    await this.session.shutdown();
    this.logger.debug('Session shutdown');
  }

  public subscribeToStatusChange(listener: SessionStatusListener) {
    return this.session.onStatusChange((data) => listener({ name: this.name, ...data }));
  }

  public requestSession() {
    return this.session.requestSession();
  }

  public setParentSessionDependency(parentSessionWrapper: SessionWrapper) {
    this.session.setParams({ getParentSession: () => parentSessionWrapper.requestSession() });
  }

  public invalidateSession() {
    this.logger.debug('Session forced to invalidate');
    return this.session.invalidateSession('Session forced to invalidate');
  }
}

export interface SessionMetadata {
  Session: SessionConstructor<any>;
  credentials?: string;
  parentSession?: string;
}

export class SessionsRegistrar {
  protected names: string[] = [];
  protected sessions: Record<string, SessionWrapper> = {};
  protected sessionStatuses: Record<string, SessionStatus> = {};
  protected listeners: AllHttpSessionsStatusListener[] = [];
  protected unsubscribers: (() => any)[] = [];
  protected logger: TaskMasterLogger;
  constructor(
    protected credentials: CredentialsRegistrar,
    logger: TaskMasterLogger,
    protected logHttpRequests: boolean
  ) {
    this.logger = logger.namespace('Sessions');
  }
  public subscribeToStatusChange(listener: AllHttpSessionsStatusListener) {
    this.listeners.push(listener);
    listener(this.names.map((name) => this.sessionStatuses[name]));
    return () => {
      const index = this.listeners.findIndex((fn) => fn === listener);
      if (index >= 0) this.listeners.splice(index, 1);
      if (this.listeners.length === 0) {
        this.unsubscribers.forEach((fn) => fn());
        this.unsubscribers = [];
      }
    };
  }
  public async shutdown() {
    await Promise.all(this.names.map((name) => this.sessions[name]).map((sess) => sess.shutdown()));
    this.unsubscribers.forEach((fn) => fn());
    this.unsubscribers = [];
  }

  public requestSession(name: string): Promise<HttpSessionObject<any>> {
    if (!this.sessions[name]) throw TypeError(`Session not found: ${name}`);
    return this.sessions[name].requestSession() as unknown as Promise<HttpSessionObject<any>>;
  }

  public invalidateSession(name?: string) {
    if (name) {
      return this.sessions[name].invalidateSession();
    } else {
      return Promise.all(this.names.map((name) => this.sessions[name].invalidateSession()));
    }
  }
  public register(
    name: string,
    Session: SessionConstructor<any>,
    options?: { parentSession?: string; credentials?: string }
  ): this {
    if (this.sessions[name]) return this;
    this.names.push(name);
    this.sessions[name] = new SessionWrapper(name, Session, this.logger.namespace(name), this.logHttpRequests);
    if (options) {
      if (options.credentials) {
        this.sessions[name].subscribeToCredentials(this.credentials, options.credentials);
      }
      if (options.parentSession) {
        this.sessions[name].setParentSessionDependency(this.sessions[options.parentSession]);
      }
    }
    this.unsubscribers.push(
      this.sessions[name].subscribeToStatusChange((status) => {
        this.sessionStatuses[name] = status;
        const statuses = this.names.map((name) => this.sessionStatuses[name]);
        this.listeners.forEach((fn) => fn(statuses));
      })
    );

    return this;
  }
}
