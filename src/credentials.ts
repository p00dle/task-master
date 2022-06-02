import type { TaskerLogger } from './types/logger';
import { UtilityClass } from './lib/UtilityClass';
import { CredentialsData, CredentialsListener, CredentialsStatus, EnvVars } from './types/credentials';

export class Credentials extends UtilityClass<CredentialsStatus> {
  protected username: string | null = null;
  protected password: string | null = null;
  public status: CredentialsStatus;
  protected areCredentialsValid: boolean | null = null;
  protected listeners: CredentialsListener[] = [];

  constructor(protected name: string, protected envVars: EnvVars, public logger: TaskerLogger) {
    super();
    if (envVars.username) this.username = process.env[envVars.username] || null;
    if (envVars.password) this.password = process.env[envVars.password] || null;
    this.status = {
      status: this.username !== null && this.password !== null ? 'Provided' : 'Not Provided',
      name: this.name,
      username: this.username,
      hasPassword: this.password !== null,
      valid: null,
    };
  }

  public getCredentials(): CredentialsData {
    return { username: this.username, password: this.password };
  }

  public setCredentials({ username, password }: { username: string | null; password: string | null }) {
    this.username = username;
    this.password = password;
    this.logger.debug('Credentials set for user: ' + username);
    this.changeStatus({
      status: 'Provided',
      username,
      hasPassword: typeof password === 'string' && password.length > 0,
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
