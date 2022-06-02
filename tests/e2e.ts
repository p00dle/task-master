import { Credentials, Session, DataApi, Task, tasker } from '../src';
import { callBackPromise } from '../src/lib/callbackPromise';

describe('e2e', () => {
  it('works when combining credentials, sessions, apis and tasks', async () => {
    let result: any;
    const creds = new Credentials('creds1');
    const [finishedPromise, cb] = callBackPromise();
    const sessionCred = new Session(
      'sessionCred',
      { credentials: creds },
      {
        state: {} as { username: string | null; password: string | null },
        async login(session) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          session.setState({ username: session.username, password: session.password });
        },
      }
    );
    const sessionChild = new Session(
      'sessionChild',
      { parentSession: sessionCred },
      {
        state: {} as { username2: string | null; password2: string | null },
        async login(session) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          const { username, password } = session.parentSession.getState();
          session.setState({ username2: username, password2: password });
        },
      }
    );
    const source1 = new DataApi(
      'source1',
      { session: sessionChild },
      {
        async getChildState({ session }, arg: number) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { ...session.getState(), arg };
        },
      }
    );
    const source2 = new DataApi(
      'source2',
      { session: sessionCred },
      {
        async getParentState({ session }, arg: boolean) {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { ...session.getState(), arg };
        },
      }
    );
    const target1 = new DataApi(
      'target1',
      { session: sessionChild },
      {
        async uploadStates(_, args: any) {
          result = args;
          cb();
        },
      }
    );
    const task = new Task(
      'task',
      {
        state: {} as { src1: any; src2: any },
        sources: { source1, source2 },
        targets: { target1 },
      },
      [
        async function getSource1(task) {
          task.state.src1 = await task.getFromSource('source1', 'getChildState', 123);
        },
        async function getSource2(task) {
          task.state.src2 = await task.getFromSource('source2', 'getParentState', true);
        },
        async function uploadTarget1(task) {
          await task.sendToTarget('target1', 'uploadStates', task.state);
        },
      ]
    );
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
