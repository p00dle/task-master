import { Credentials, Session, DataApi, Task, tasker } from '../src';
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
          session.log.debug(session.username);
        },
      },
    });

    const source1 = new DataApi({
      name: 'source1',
      session: sessionChild,
      api: {
        async getChildState({ session, log }, arg: number) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          log.debug('hello');
          return { ...session.getState(), arg };
        },
      },
    });

    const sessionlessSource = new DataApi({
      name: 'sessionless',
      api: {
        async doNothing({ log }, param: boolean) {
          // @ts-expect-error should not have access to session
          log.debug(JSON.stringify(session));
          return 'string ' + param;
        },
      },
    });

    const source2 = new DataApi({
      name: 'source2',
      session: sessionParent,
      api: {
        async getParentState({ session }, arg: boolean) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { ...session.getState(), arg };
        },
      },
    });

    const target1 = new DataApi({
      name: 'target1',
      session: sessionChild,
      api: {
        async uploadStates(_, args: any) {
          result = args;
          cb();
        },
      },
    });

    const task = new Task({
      name: 'task',
      state: {} as { src1: any; src2: any },
      sources: { source1, source2, sessionlessSource },
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
