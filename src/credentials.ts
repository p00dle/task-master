import type { TaskerLogger } from './types/logger';
import { UtilityClass } from './lib/UtilityClass';
import { noOpLogger } from './lib/noOpLogger';

export type CredentialsData = { username: string | null; password: string | null };

export interface CredentialsStatus {
  status: 'Not Provided' | 'Provided' | 'Valid' | 'Invalid';
  name: string;
  username: string | null;
  valid: boolean | null;
  hasPassword: boolean;
}

export interface CredentialsOptions {
  name: string;
  envUsername?: string;
  envPassword?: string;
}

export class Credentials extends UtilityClass<CredentialsStatus> {
  public name: string;
  public status: CredentialsStatus;
  public logger: TaskerLogger = noOpLogger;
  protected credentials: CredentialsData = { username: null, password: null };
  protected envUsername: string | undefined;
  protected envPassword: string | undefined;
  constructor(options: CredentialsOptions) {
    super();
    this.name = options.name;
    this.envUsername = options.envUsername;
    this.envPassword = options.envPassword;
    this.status = {
      status: 'Not Provided',
      name: this.name,
      username: this.credentials.username,
      hasPassword: false,
      valid: null,
    };
  }

  public register(logger: TaskerLogger) {
    this.logger = logger;
    if (this.envUsername) this.credentials.username = process.env[this.envUsername] || null;
    if (this.envPassword) this.credentials.password = process.env[this.envPassword] || null;
  }

  public getCredentials(): CredentialsData {
    return this.credentials;
  }

  public setCredentials(credentials: CredentialsData) {
    this.credentials = credentials;
    this.logger.debug('Credentials set for user: ' + credentials.username);
    this.changeStatus({
      status: 'Provided',
      username: credentials.username,
      hasPassword: typeof credentials.password === 'string' && credentials.password.length > 0,
      valid: null,
    });
  }

  public setValid(valid: boolean) {
    if (this.status.valid !== valid) {
      this.logger.debug(valid ? 'Valid credentials' : 'Invalid credentials');
    }
    this.changeStatus({ status: valid ? 'Valid' : 'Invalid', valid });
  }
}
