import { HttpSession, HttpSessionObject } from '@kksiuda/http-session';
import { noOpLogger } from '../src/lib/noOpLogger';
import { CredentialsRegistrar } from '../src/credentials';
import { SessionsRegistrar } from '../src/sessions';

interface Session1Params {
  username: string;
  password: string;
}
class Session1 extends HttpSession<Session1Params> {}

interface Session2Params {
  getParentSession: () => Promise<HttpSessionObject<Session1Params>>;
  username: string;
  password: string;
}
class Session2 extends HttpSession<Session2Params> {}

describe('sessions', () => {
  const initialEnv = process.env;
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...initialEnv };
  });
  afterEach(() => {
    process.env = initialEnv;
  });
  it('sessions have credentials set by env vars and have access to parent sessions', async () => {
    process.env.ENV_USER = 'user1';
    process.env.ENV_PASS = 'hunter2';
    const credentials = new CredentialsRegistrar(noOpLogger)
      .register('app1', { username: 'ENV_USER', password: 'ENV_PASS' })
      .register('app2');
    const sessions = new SessionsRegistrar(credentials, noOpLogger, false)
      .register('sess1', Session1, { credentials: 'app1' })
      .register('sess2', Session2, { parentSession: 'sess1', credentials: 'app2' });

    credentials.setCredentials('app2', 'user2', 'secret');
    const session1 = await sessions.requestSession('sess1');
    const creds1 = session1.getParams();
    expect(creds1).toEqual({ username: 'user1', password: 'hunter2' });
    await session1.release();
    const session2 = await sessions.requestSession('sess2');
    const params = session2.getParams();
    expect(params.username).toBe('user2');
    expect(params.password).toBe('secret');
    const parentSession = await params.getParentSession();
    const creds2 = parentSession.getParams();
    expect(creds2).toEqual({ username: 'user1', password: 'hunter2' });
    await parentSession.release();
    await session2.release();
    await sessions.shutdown();
  });
  it('sessions emit events on status change', async () => {
    const session1Statuses: string[] = [];
    const session2Statuses: string[] = [];
    const sessions = new SessionsRegistrar(new CredentialsRegistrar(noOpLogger), noOpLogger, false)
      .register('sess1', Session1)
      .register('sess2', Session2);
    const unsubscribe = sessions.subscribeToStatusChange((statuses) => {
      for (const status of statuses) {
        const statusArray = status.name === 'sess1' ? session1Statuses : session2Statuses;
        if (status.status !== statusArray[statusArray.length - 1]) statusArray.push(status.status);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const session1 = await sessions.requestSession('sess1');
    await session1.release();
    const session2 = await sessions.requestSession('sess2');
    await session2.release();

    expect(session1Statuses).toEqual(['Ready', 'In Use', 'Ready']);
    expect(session1Statuses).toEqual(['Ready', 'In Use', 'Ready']);
    unsubscribe();
    await sessions.shutdown();
  });
});
