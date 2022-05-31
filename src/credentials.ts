import { StatusClass } from './lib/StatusClass';
import type { TaskMasterLogger, Unsubscribe } from './types';

type CredentialsListener = (creds: { username: string | null; password: string | null }) => any;
type EnvVars = { username?: string; password?: string };
type StatusChangeListener = (status: CredentialsStatus) => any;

export interface CredentialsStatus {
  name: string;
  username: string | null;
  valid: boolean | null;
  hasPassword: boolean;
}

export class Credentials extends StatusClass<CredentialsStatus> {
  protected username: string | null = null;
  protected password: string | null = null;
  protected status: CredentialsStatus;
  protected areCredentialsValid: boolean | null = null;
  protected listeners: CredentialsListener[] = [];
  protected statusChangeListeners: StatusChangeListener[] = [];

  constructor(protected name: string, protected envVars: EnvVars | undefined, protected logger: TaskMasterLogger) {
    super();
    if (envVars && envVars.username) this.username = process.env[envVars.username] || null;
    if (envVars && envVars.password) this.password = process.env[envVars.password] || null;
    this.status = {
      name: this.name,
      username: this.username,
      hasPassword: this.password !== null,
      valid: null,
    };
  }

  public onCredentials(listener: CredentialsListener): Unsubscribe {
    this.emitter.on('credentials', listener);
    listener({ username: this.username, password: this.password });
    return () => this.emitter.off('credentials', listener);
  }

  public setCredentials(username: string | null, password: string | null) {
    this.username = username;
    this.password = password;
    this.logger.debug('Credentials set for user: ' + username);
    this.changeStatus({ username, hasPassword: typeof password === 'string' && password.length > 0, valid: null });
    this.emitter.emit('credentials');
  }

  public setValid(valid: boolean) {
    this.logger.debug(valid ? 'Valid credentials' : 'Invalid credentials');
    this.changeStatus({ valid });
  }

  public serialize() {
    return this.envVars;
  }
}
