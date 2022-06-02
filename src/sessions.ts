import type { HttpSessionOptions, HttpSessionStatusData, HttpSessionObject, SessionDeps } from './types/session';
import type { TaskerLogger } from './types/logger';

import { HttpSession } from '@kksiuda/http-session';
import { noOpLogger } from './lib/noOpLogger';
import { UtilityClass } from './lib/UtilityClass';
import { Credentials } from './credentials';

export class Session<S, P, C extends Credentials | void> extends UtilityClass<HttpSessionStatusData> {
  public status: HttpSessionStatusData = {} as HttpSessionStatusData;
  public logger: TaskerLogger = noOpLogger;
  public deps: SessionDeps<P, C>;
  protected session: HttpSession<S, any> | null = null;
  protected parentSessionMap = new Map<symbol, HttpSessionObject>();
  constructor(
    public name: string,
    dependencies: SessionDeps<P, C>,
    protected sessionOptions: HttpSessionOptions<
      S,
      (P extends void ? unknown : { parentSession: HttpSessionObject<P> }) &
        (C extends void ? unknown : { username: string | null; password: string | null })
    >
  ) {
    super();
    this.deps = dependencies;
  }

  public register(logger: TaskerLogger, logHttpRequests: boolean) {
    this.logger = logger;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore // TODO: need to fix the typings somehow; they work elsewhere but not here
    this.session = new HttpSession({
      enhanceLoginMethods: this.enhanceLoginMethods.bind(this),
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
        if (this.deps.parentSession) {
          const parentSession = await this.deps.parentSession.requestSession();
          this.parentSessionMap.set(ref, parentSession);
        }
      },
      onRelease: (ref: symbol) => {
        if (this.parentSessionMap.has(ref)) {
          const parentSession = this.parentSessionMap.get(ref);
          parentSession.release();
          this.parentSessionMap.delete(ref);
        }
      },
    });
    if (this.deps.credentials) {
      this.deps.credentials.setValid(this.status.isLoggedIn);
    }
    return session;
  }

  public invalidateSession() {
    if (!this.session) return;
    this.logger.debug('Session forced to invalidate');
    return this.session.invalidateSession('Session forced to invalidate');
  }

  protected async enhanceLoginMethods(ref: symbol) {
    const output: any = {};
    if (this.deps.parentSession) {
      output.parentSession = this.parentSessionMap.get(ref);
    }
    if (this.deps.credentials) {
      const credentials = this.deps.credentials.getCredentials();
      output.username = credentials.username;
      output.password = credentials.password;
    }
    return output;
  }
}
