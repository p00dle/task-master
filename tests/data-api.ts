import { DataApi, Session } from '../src';
import { mockHttpRequestFactory } from '../src/lib/mockHttpRequest';
import { collectStreamToString } from '../src/lib/collectStreamToString';
import { noOpLogger } from '../src/lib/noOpLogger';

describe('DataApi', () => {
  it('sets and gets last updated for targets and sources', () => {
    const api = new DataApi({ name: 'src1' });
    const now = Date.now();
    api.setSourceLastUpdated(now);
    api.setTargetLastUpdated(now);
    expect(api.getSourceLastUpdated()).toBe(now);
    expect(api.getTargetLastUpdated()).toBe(now);
    api.setSourceLastUpdated(null);
    api.setTargetLastUpdated(null);
    expect(api.getSourceLastUpdated()).toBeNull();
    expect(api.getTargetLastUpdated()).toBeNull();
  });

  it('throws an error when calling an undefined target or source', async () => {
    let targetErr: any = null;
    let sourceErr: any = null;
    const api = new DataApi({ name: 'src2' });
    try {
      await api.callTargetApi('undefined-path', null);
    } catch (err) {
      targetErr = err;
    }
    try {
      await api.callSourceApi('undefined-path', null);
    } catch (err) {
      sourceErr = err;
    }
    expect(targetErr).not.toBeNull();
    expect(sourceErr).not.toBeNull();
  });

  it('throws when requesting an unregistered resource', async () => {
    let sourceErr: any = null;
    let targetErr: any = null;
    const sourceApi = new DataApi({
      name: 'src3',
      sources: {
        foo: async ({ requestResource }) => {
          try {
            await requestResource('unregistered-resource');
          } catch (err) {
            sourceErr = err;
          }
        },
      },
    });
    const targetApi = new DataApi({
      name: 'trg1',
      dependencies: { sess1: new Session({ name: 'sess1' }) },
      targets: {
        bar: async ({ requestResource }) => {
          try {
            // @ts-expect-error only valid dependencies are permitted
            await requestResource('unregistered-resource');
          } catch (err) {
            targetErr = err;
          }
        },
      },
    });
    await sourceApi.callSourceApi('foo', null);
    await targetApi.callTargetApi('bar', null);
    expect(sourceErr).not.toBeNull();
    expect(targetErr).not.toBeNull();
  });

  it('propagates errors originating in the api call code', async () => {
    const err = new Error('');
    let caughtErr: any = null;
    const api = new DataApi({
      name: 'api5',
      sources: {
        get: async () => {
          throw err;
        },
      },
    });
    try {
      await api.callSourceApi('get', undefined);
    } catch (err) {
      caughtErr = err;
    }
    expect(caughtErr).toBe(err);
  });

  it('releases all resources on success', async () => {
    const httpRequest = mockHttpRequestFactory({ returns: 'OK' });
    let lastStatus: any = null;
    const session = new Session({
      name: 'session6',
      params: {
        _makeHttpRequest: httpRequest,
      },
    });
    session.register(noOpLogger, true);
    const api = new DataApi({
      name: 'api6',
      dependencies: { session },
      sources: {
        get: async ({ requestResource }) => {
          const session = await requestResource('session');
          return session.request({ url: 'http://example.com' });
        },
        getStream: async ({ requestResource }) => {
          const session = await requestResource('session');
          const response = await session.request({ url: 'http://example.com', responseType: 'stream' });
          return response.data;
        },
      },
    });
    session.onStatus((status) => {
      lastStatus = status;
    });
    await api.callSourceApi('get', undefined);
    const stream = await api.callSourceApi('getStream', undefined);
    if (stream) await collectStreamToString(stream);
    session.clearAllTimeouts();
    expect(lastStatus).toMatchObject({ inQueue: 0, status: 'Ready' });
  });

  it('allows for multiple concurrent requests', async () => {
    const api = new DataApi({
      name: 'api8',
      sources: {
        get: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return 'GET';
        },
      },
      targets: {
        set: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return 'SET';
        },
      },
    });
    const promise1 = api.callSourceApi('get', undefined);
    const promise2 = api.callSourceApi('get', undefined);
    const promise3 = api.callTargetApi('set', undefined);
    const promise4 = api.callTargetApi('set', undefined);
    expect(await Promise.all([promise1, promise2, promise3, promise4])).toEqual(['GET', 'GET', 'SET', 'SET']);
  });
});
