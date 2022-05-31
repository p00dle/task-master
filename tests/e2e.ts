import { HttpSession } from '@kksiuda/http-session';
import { TaskMaster } from '../src';

class PlainSession extends HttpSession {}

describe('e2e', () => {
  it('should shut all services and GUI server gracefully on shutdown', async () => {
    let receivedData: number[] = [];
    const tm = new TaskMaster({ gui: {} })
      .registerCredentials('cred1')
      .registerSession('sess1', PlainSession)
      .registerDataSource('ds1', {
        session: 'sess1',
        get: {
          data: async () => [1, 2, 3],
        },
      })
      .registerDataSource('dt1', {
        set: {
          numbers: async (_, data: number[]) => {
            receivedData = data;
          },
        },
      })
      .registerTask<{ data: number[] }>('task1')({
        sources: ['ds1'],
        steps: [
          async function extract(task) {
            task.local.data = await task.get('ds1', 'data', undefined);
          },
          async function transform(task) {
            task.local.data = task.local.data.map((x) => x * 2);
          },
          async function load(task) {
            await task.set('dt1', 'numbers', task.local.data);
          },
        ],
      })
      .registerTask('long-running')({
        steps: [
          async function longRunning() {
            await new Promise((resolve) => setTimeout(resolve, 5000));
          },
        ],
      })
      .registerTask('error-task')({
      steps: [
        async function error() {
          throw new Error('BAD THINGS');
        },
        async function shouldNeverRun() {
          //
        },
      ],
    });
    // const tm = new TaskMaster({ gui: {}, autostartTasks: false })
    //   .registerCredentials('cred1')
    //   .registerSession('sess1', PlainSession)
    //   .registerDataSource('ds1', {
    //     session: 'sess1',
    //     get: {
    //       data: async () => [1, 2, 3],
    //     },
    //   })
    //   .registerDataSource('dt1', {
    //     set: {
    //       numbers: async (_, data: number[]) => {
    //         receivedData = data;
    //       },
    //     },
    //   })
    //   .registerTask<{ data: number[] }>('task1')({
    //   sources: ['ds1'],
    //   steps: [
    //     async function extract(task) {
    //       task.local.data = await task.get('ds1', 'data', undefined);
    //     },
    //     async function transform(task) {
    //       task.local.data = task.local.data.map((x) => x * 2);
    //     },
    //     async function load(task) {
    //       await task.set('dt1', 'numbers', task.local.data);
    //     },
    //   ],
    // });
    await tm.startTask('task1');
    await tm.shutdown();
    expect(receivedData).toEqual([2, 4, 6]);
  });
});
