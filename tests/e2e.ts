import { Credentials, Session, DataApi, Task, MemoryStore, tasker } from '../src';
import { callBackPromise } from '../src/lib/callbackPromise';

describe('e2e', () => {
  it('works when combining credentials, sessions, apis and tasks', async () => {
    let result: any;
    const [finishedPromise, cb] = callBackPromise();

    const creds = new Credentials({ name: 'creds1' });

    const sessionParent = new Session({
      name: 's-parent',
      credentials: creds,
      params: {
        state: {} as { username: string | null; password: string | null },
        async login(session) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          session.setState({ username: session.username, password: session.password });
          // @ts-expect-error should not have access parentSession
          session.log.debug(JSON.stringify(session.parentSession));
        },
        async logout(session) {
          session.log.debug('should have access to log');
        },
      },
    });

    const sessionChild = new Session({
      name: 's-child',
      parentSession: sessionParent,
      params: {
        state: {} as { username2: string | null; password2: string | null },
        async login(session) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          const { username, password } = session.parentSession.getState();
          session.setState({ username2: username, password2: password });
          // @ts-expect-error should not have access to credentials
          session.log.debug('' + session.username);
        },
      },
    });

    const source1 = new DataApi({
      name: 'source1',
      dependencies: {
        session: sessionChild,
      },
      sources: {
        async getChildState({ requestResource, log }, arg: number) {
          const session = await requestResource('session');
          await new Promise((resolve) => setTimeout(resolve, 30));
          log.debug('hello');
          return { ...session.getState(), arg };
        },
      },
    });

    const sessionlessSource = new DataApi({
      name: 'sessionless',
      sources: {
        async doNothing({ log }, param: boolean) {
          // @ts-expect-error should not have access to session
          log.debug(JSON.stringify(session));
          return 'string ' + param;
        },
      },
    });

    const source2 = new DataApi({
      name: 'source2',
      dependencies: {
        session: sessionParent,
      },
      sources: {
        async getParentState({ requestResource }, arg: boolean) {
          const session = await requestResource('session');
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { ...session.getState(), arg };
        },
      },
    });

    const memoryStore = new MemoryStore<{ src1: any; src2: any }>();

    const target1 = new DataApi({
      name: 'target1',
      dependencies: {
        session: sessionChild,
        store: memoryStore,
      },
      sources: {
        async getStates({ requestResource }) {
          const store = await requestResource('store');
          return {
            src1: store.get('src1'),
            src2: store.get('src2'),
          };
        },
      },
      targets: {
        async uploadStates({ requestResource }, { src1, src2 }: { src1: any; src2: any }) {
          const store = await requestResource('store');
          store.set('src1', src1);
          store.set('src2', src2);
        },
      },
    });

    const task = new Task({
      name: 'task',
      state: {} as { src1: any; src2: any },
      sources: { source1, source2, sessionlessSource, target1 },
      targets: { target1 },
      steps: [
        async function getSource1(task) {
          task.state.src1 = await task.getFromSource('source1', 'getChildState', 123);
        },
        async function getSource2(task) {
          task.state.src2 = await task.getFromSource('source2', 'getParentState', true);
        },
        async function uploadTarget1(task) {
          await task.sendToTarget('target1', 'uploadStates', task.state);
        },
        async function getFromStore(task) {
          result = await task.getFromSource('target1', 'getStates', undefined);
          cb();
        },
      ],
    });

    const tm = tasker.start([task]);
    tm.startTask('task');
    await finishedPromise;
    await tm.shutdown();
    expect(result).toEqual({
      src1: { username2: null, password2: null, arg: 123 },
      src2: { username: null, password: null, arg: true },
    });
  });
});

/*
TODO: 
  - Credentials
    - get credentials for environment
    - setCredentials
    - setValid(false)
  - DataApi
    - (set|get)(Source|Target)LastUpdated (do Task first, should cover it)
    - call(Source|Target)Api when api is not defined, and when path is not defined
    - no dependencies
    - dependency throws an error
    - more than one consecutive calls to a DataApi
  - GUI
    - everything
  - GUI-server
    - server throws error before starting
    - shutdown tasker before server starts
  - LogStore
    - everything
  - logging
    - everything
  - Session
    - logHttpRequests = true
    - request session before registering
    - setState
    - invalidateSession
    - 
  - Task
    - (set|get)(Source|Target)LastUpdated
    - getFromSourc, sendToTarget try to call undefined
    - schedule and cron job (forceStop and forceStart)
    - retry whole task
    - setState
    - forceStop, forceStart while task is running
    - fail task
    - use return symbols in step; test retrying step
    - waitForPromise
  - Tasker-Options
    - test different options
  - Tasker
    - check coverage after GUI, GUI-server, LogStore and logging 
*/
