import { Logger } from '@kksiuda/logger';
import { Credentials, CredentialsRegistrar } from '../src/credentials';

const noOpLogger = new Logger<{ message: string; details?: string }>({ logLevel: 'silent' });

describe('Credentials', () => {
  class PublicCredentials extends Credentials {
    public getPrivateProps() {
      return {
        username: this.username,
        password: this.password,
        areCredentialsValid: this.areCredentialsValid,
        subscribers: this.listeners,
        statusChangeSubscribers: this.statusChangeListeners,
      };
    }
  }
  const initialEnv = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...initialEnv };
  });
  afterEach(() => {
    process.env = initialEnv;
  });
  it('gets username and password from environment variables', () => {
    process.env['CRED_USERNAME'] = 'user1';
    process.env['CRED_PASSWORD'] = 'hunter2';
    const creds = new PublicCredentials('cred', { username: 'CRED_USERNAME', password: 'CRED_PASSWORD' }, noOpLogger);
    expect(creds.getPrivateProps()).toMatchObject({ username: 'user1', password: 'hunter2' });
  });
  it('if the environment variables are not defined password and username should be null', () => {
    const creds = new PublicCredentials('cred', { username: 'CRED_USERNAME', password: 'CRED_PASSWORD' }, noOpLogger);
    expect(creds.getPrivateProps()).toMatchObject({ username: null, password: null });
  });
  it('the environment variables can be omitted', () => {
    const creds = new PublicCredentials('cred', {}, noOpLogger);
    expect(creds.getPrivateProps()).toMatchObject({ username: null, password: null });
  });
  it('setCredentials and setValid update state correctly', () => {
    const creds = new PublicCredentials('cred', {}, noOpLogger);
    expect(creds.getPrivateProps()).toMatchObject({ username: null, password: null, areCredentialsValid: null });
    creds.setCredentials('user1', 'hunter2');
    creds.setValid(true);
    expect(creds.getPrivateProps()).toMatchObject({
      username: 'user1',
      password: 'hunter2',
      areCredentialsValid: true,
    });
  });
  it('subscribe/unsubscribe works', () => {
    const creds = new PublicCredentials('cred', {}, noOpLogger);
    expect(creds.getPrivateProps().subscribers).toHaveLength(0);
    const subscriptionResults: { username: string | null; password: string | null }[] = [];
    const unsubscribe = creds.subscribe((username, password) => subscriptionResults.push({ username, password }));
    expect(creds.getPrivateProps().subscribers).toHaveLength(1);
    expect(subscriptionResults).toHaveLength(0);
    creds.setCredentials('user1', 'hunter2');
    expect(subscriptionResults[0]).toEqual({ username: 'user1', password: 'hunter2' });
    unsubscribe();
    expect(creds.getPrivateProps().subscribers).toHaveLength(0);
    creds.setCredentials('user2', 'secret');
    expect(subscriptionResults).toHaveLength(1);
  });
  it('if username and password are populated subscribe will fire straight away', () => {
    const creds = new PublicCredentials('cred', {}, noOpLogger);
    creds.setCredentials('user1', 'hunter2');
    const subscriptionResults: { username: string | null; password: string | null }[] = [];
    const unsubscribe = creds.subscribe((username, password) => subscriptionResults.push({ username, password }));
    expect(subscriptionResults[0]).toEqual({ username: 'user1', password: 'hunter2' });
    unsubscribe();
  });
  it('subscribe/unsubscribe to status changes works', () => {
    const creds = new PublicCredentials('cred', {}, noOpLogger);
    expect(creds.getPrivateProps().statusChangeSubscribers).toHaveLength(0);
    const subscriptionResults: ReturnType<PublicCredentials['serialize']>[] = [];
    const unsubscribe = creds.subscribeToStatusChange((status) => subscriptionResults.push(status));
    expect(creds.getPrivateProps().statusChangeSubscribers).toHaveLength(1);
    expect(subscriptionResults).toHaveLength(0);
    creds.setCredentials('user1', 'hunter2');
    expect(subscriptionResults[0]).toEqual({ name: 'cred', username: 'user1', hasPassword: true, valid: null });
    creds.setValid(false);
    expect(subscriptionResults[1]).toEqual({ name: 'cred', username: 'user1', hasPassword: true, valid: false });
    unsubscribe();
    expect(creds.getPrivateProps().statusChangeSubscribers).toHaveLength(0);
    creds.setCredentials('user2', 'secret');
    expect(subscriptionResults).toHaveLength(2);
  });
});

describe('CredentialsRegistrar', () => {
  class PublicCredentialsRegistrar extends CredentialsRegistrar {
    public getPrivateProps() {
      return {
        names: this.names,
        credentials: this.credentials,
        credentialsStatuses: this.credentialsStatuses,
        unsubscribers: this.unsubscribers,
        subscribers: this.listeners,
      };
    }
  }
  it('creates a Credentials instance for each supplied property', () => {
    const creds = new PublicCredentialsRegistrar(noOpLogger).register('app1').register('app2');
    const names = creds.getNames();
    expect(names).toEqual(['app1', 'app2']);
    const { credentials, credentialsStatuses } = creds.getPrivateProps();
    for (const name of names) {
      expect(credentials[name].serialize()).toEqual(credentialsStatuses[name]);
    }
  });
  it('forwards subscribe/unsubscribe and setCredentials', () => {
    const creds = new CredentialsRegistrar(noOpLogger).register('app1');
    let subUsername: string = undefined;
    let subPassword: string = undefined;
    const unsubscribe = creds.subscribe('app1', (username, password) => {
      subUsername = username;
      subPassword = password;
    });
    expect(subUsername).toBeUndefined();
    expect(subPassword).toBeUndefined();
    creds.setCredentials('app1', 'user1', 'hunter2');
    expect(subUsername).toBe('user1');
    expect(subPassword).toBe('hunter2');
    unsubscribe();
  });
  it('subscribe/unsubscribe to status changes works', () => {
    const creds = new PublicCredentialsRegistrar(noOpLogger).register('app1').register('app2');
    expect(creds.getPrivateProps().subscribers).toHaveLength(0);
    const subscriptionResults: ReturnType<Credentials['serialize']>[][] = [];
    const unsubscribe = creds.subscribeToStatusChange((status) => subscriptionResults.push(status));
    expect(creds.getPrivateProps().subscribers).toHaveLength(1);
    expect(subscriptionResults).toHaveLength(1);
    creds.setCredentials('app2', 'user1', 'hunter2');
    expect(subscriptionResults[1][1]).toEqual({ name: 'app2', username: 'user1', hasPassword: true, valid: null });
    creds.setValid('app1', true);
    expect(subscriptionResults[2][0]).toEqual({ name: 'app1', username: null, hasPassword: false, valid: true });
    unsubscribe();
    expect(creds.getPrivateProps().subscribers).toHaveLength(0);
    creds.setCredentials('app1', 'user2', 'secret');
    expect(subscriptionResults).toHaveLength(3);
  });
});
