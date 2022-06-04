import type {
  HttpSessionOptions,
  HttpSessionStatusData,
  HttpSessionObject,
  HttpSessionSerializedData,
} from '@kksiuda/http-session';
import type { TaskerLogger } from './types/logger';

import { HttpSession } from '@kksiuda/http-session';
import { noOpLogger } from './lib/noOpLogger';
import { UtilityClass } from './lib/UtilityClass';
import { Credentials } from './credentials';

export type { HttpSessionOptions, HttpSessionStatusData, HttpSessionObject, HttpSessionSerializedData };

export interface SessionOptions<S, P, C> {
  name: string;
  parentSession?: P;
  credentials?: C;
  params?: HttpSessionOptions<
    S,
    { log: TaskerLogger } & ([P] extends [Session<infer X, any, any>]
      ? { parentSession: HttpSessionObject<X> }
      : unknown) &
      ([C] extends [Credentials] ? { username: string | null; password: string | null } : unknown),
    { log: TaskerLogger }
  >;
}

export class Session<
  S,
  P extends Session<any, any, any> | void,
  C extends Credentials | void
> extends UtilityClass<HttpSessionStatusData> {
  public name: string;
  public status: HttpSessionStatusData = {} as HttpSessionStatusData;
  public logger: TaskerLogger = noOpLogger;
  public parentSession?: P;
  public credentials?: C;
  protected session: HttpSession<S, any, any> | null = null;
  protected sessionOptions: HttpSessionOptions<S, any, any> | undefined;
  protected parentSessionMap = new Map<symbol, HttpSessionObject<any>>();
  constructor(options: SessionOptions<S, P, C>) {
    super();
    this.name = options.name;
    this.parentSession = options.parentSession;
    this.credentials = options.credentials;
    this.sessionOptions = options.params;
  }

  public register(logger: TaskerLogger, logHttpRequests: boolean) {
    this.logger = logger;
    this.session = new HttpSession({
      enhanceLoginMethods: this.enhanceLoginMethods.bind(this),
      enhanceLogoutMethods: async () => ({ log: this.logger }),
      logger: logHttpRequests ? this.logger : noOpLogger,
      name: this.name,
      ...this.sessionOptions,
    });
    this.session.onStatus(this.changeStatus.bind(this));
  }

  public async shutdown() {
    if (!this.session) return;
    this.logger.debug('Shutting session down');
    await this.session.shutdown();
    this.logger.debug('Session shutdown');
  }

  public async requestSession() {
    if (!this.session) throw new TypeError('Session used before being registered');
    const ref = Symbol('request-session-wrapper-ref');
    const session = await this.session.requestSession({
      ref,
      beforeRequest: async (ref: symbol) => {
        if (this.parentSession) {
          const parentSession = await this.parentSession.requestSession();
          this.parentSessionMap.set(ref, parentSession);
        }
      },
      onRelease: (ref: symbol) => {
        if (this.parentSessionMap.has(ref)) {
          const parentSession = this.parentSessionMap.get(ref);
          if (parentSession) {
            parentSession.release();
            this.parentSessionMap.delete(ref);
          }
        }
      },
    });
    if (this.credentials) {
      this.credentials.setValid(this.status.isLoggedIn);
    }
    return session;
  }

  public setState(state: Partial<S>) {
    if (this.session) {
      this.session.setState(state);
    }
  }

  public invalidateSession() {
    if (!this.session) return;
    this.logger.debug('Session forced to invalidate');
    return this.session.invalidateSession('Session forced to invalidate');
  }

  protected async enhanceLoginMethods(ref: symbol) {
    const output: any = { log: this.logger };
    if (this.parentSession) {
      output.parentSession = this.parentSessionMap.get(ref);
    }
    if (this.credentials) {
      const credentials = this.credentials.getCredentials();
      output.username = credentials.username;
      output.password = credentials.password;
    }
    return output;
  }
}
