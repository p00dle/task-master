import { mockHttpRequestFactory } from '../src/lib/mockHttpRequest';
import { arrayLogger } from '../src/lib/arrayLogger';
import { Session } from '../src';
import { noOpLogger } from '../src/lib/noOpLogger';

describe('Session', () => {
  it('throws an error when session is requested before registering', async () => {
    const session = new Session({ name: 'sess1' });
    let error: Error | null = null;
    try {
      await session.requestResource();
    } catch (err) {
      error = err;
    }
    expect(error).not.toBeNull();
  });

  it('logs http requests when specified', async () => {
    const [logs, logger] = arrayLogger();
    const makeHttpRequest = mockHttpRequestFactory({ returns: 'OK' });
    const session = new Session({
      name: 'sess2',
      params: {
        _makeHttpRequest: makeHttpRequest,
      },
    });
    session.register(logger, true);
    const { request } = await session.requestResource();
    await request({ url: 'http://example.com' });
    expect(logs).toHaveLength(2);
  });

  it('sets state to underlying HttpSession before registering', async () => {
    const providedState = { foo: 'bar', num: 2 };
    let sessionState: any;
    const session = new Session({
      name: 'sess3',
      params: {
        login: (_, state) => {
          sessionState = state;
        },
      },
    });

    session.setState(providedState);
    session.register(noOpLogger, false);
    await session.requestResource();
    expect(sessionState).toEqual(providedState);
  });

  it('sets state to underlying HttpSession after registering', async () => {
    const providedState = { foo: 'bar', num: 2 };
    let sessionState: any;
    const session = new Session({
      name: 'sess4',
      params: {
        login: (_, state) => {
          sessionState = state;
        },
      },
    });

    session.register(noOpLogger, false);
    session.setState(providedState);
    await session.requestResource();
    expect(sessionState).toEqual(providedState);
  });

  it('passes invalidateSession to underlying HttpSession before registering', async () => {
    const session = new Session({ name: 'sess5' });
    await session.invalidateSession();
    session.register(noOpLogger, false);
    expect(true).toBe(true);
  });

  it('passes invalidateSession to underlying HttpSession after registering', async () => {
    const [logs, logger] = arrayLogger();
    const session = new Session({ name: 'sess6' });
    session.register(logger, false);
    await session.invalidateSession();
    expect(logs).toHaveLength(1);
  });
});
