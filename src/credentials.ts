import type { TaskerLogger } from './types/logger';
import { UtilityClass } from './lib/UtilityClass';
import { CredentialsData, CredentialsStatus, EnvVars } from './types/credentials';
import { noOpLogger } from './lib/noOpLogger';

export class Credentials extends UtilityClass<CredentialsStatus> {
  public status: CredentialsStatus;
  public logger: TaskerLogger = noOpLogger;
  protected credentials: CredentialsData = { username: null, password: null };
  protected password: string | null = null;

  constructor(public name: string, protected envVars: EnvVars = {}) {
    super();
    this.status = {
      status: 'Not Provided',
      name: this.name,
      username: this.credentials.username,
      hasPassword: this.password !== null,
      valid: null,
    };
  }

  public register(logger: TaskerLogger) {
    this.logger = logger;
    if (this.envVars.username) this.credentials.username = process.env[this.envVars.username] || null;
    if (this.envVars.password) this.credentials.password = process.env[this.envVars.password] || null;
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
