import { Credentials } from '../src';
import { noOpLogger } from '../src/lib/noOpLogger';

describe('Credentials', () => {
  it('picks up credentials from environment', () => {
    process.env.TASKER_TEST_CRED_USER = 'user1';
    process.env.TASKER_TEST_CRED_PASS = 'hunter2';
    const creds = new Credentials({
      name: 'creds1',
      envUsername: 'TASKER_TEST_CRED_USER',
      envPassword: 'TASKER_TEST_CRED_PASS',
    });
    creds.register(noOpLogger);
    expect(creds.getCredentials()).toEqual({ username: 'user1', password: 'hunter2' });
  });
  it('defaults to current credentials if environment variables are not set', () => {
    const creds = new Credentials({
      name: 'creds2',
      envUsername: 'EMPTY_ENV_USER',
      envPassword: 'EMPTY_ENV_PASS',
    });
    creds.setCredentials({ username: 'user2', password: 'hunter3' });
    creds.register(noOpLogger);
    expect(creds.getCredentials()).toEqual({ username: 'user2', password: 'hunter3' });
  });
  it('sets valid credentials status', () => {
    const creds = new Credentials({ name: 'cred3' });
    let credsValid: boolean | null | undefined = undefined;
    creds.onStatus(({ valid }) => {
      credsValid = valid;
    });
    creds.setCredentials({ username: 'foo', password: null });
    creds.clearAllTimeouts();
    expect(credsValid).toBe(null);
    creds.setValid(false);
    creds.clearAllTimeouts();
    expect(credsValid).toBe(false);
    creds.setValid(true);
    creds.clearAllTimeouts();
    expect(credsValid).toBe(true);
  });
});
