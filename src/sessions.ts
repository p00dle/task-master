import type { SessionDeps, SessionOptions, SessionStatus } from './types/session';
import type { TaskerLogger } from './types/logger';

import { HttpSession } from '@kksiuda/http-session';
import { noOpLogger } from './lib/noOpLogger';
import { UtilityClass } from './lib/UtilityClass';

export class Session extends UtilityClass<SessionStatus> {
  protected session: HttpSession;
  protected status: SessionStatus = {} as SessionStatus;
  constructor(
    protected name: string,
    sessionOptions: SessionOptions,
    protected getDependencies: () => Promise<SessionDeps>,
    protected logger: TaskerLogger,
    logHttpRequests: boolean
  ) {
    super();
    this.session = new HttpSession({ logger: logHttpRequests ? logger : noOpLogger, name, ...sessionOptions });
    this.session.onStatus(this.changeStatus.bind(this));
  }

  public async shutdown() {
    this.logger.debug('Shutting session down');
    await this.session.shutdown();
    this.logger.debug('Session shutdown');
  }

  public async requestSession(timeoutMs = 30000) {
    const { parentSession, credentials, validateCredentials } = await this.getDependencies();
    if (parentSession) this.session.setState({ parentSession });
    if (credentials && validateCredentials) {
      this.session.setCredentials(credentials);
      this.session.setState({ validateCredentials });
    }
    const session = await this.session.requestSession(timeoutMs, () => {
      if (parentSession && !parentSession.wasReleased) parentSession.release();
    });
    if (validateCredentials) validateCredentials(this.status.status === 'Ready' || this.status.status === 'In Use');
    return session;
  }

  public invalidateSession() {
    this.logger.debug('Session forced to invalidate');
    return this.session.invalidateSession('Session forced to invalidate');
  }
}
