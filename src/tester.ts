import { tasker } from '.';

const tc1 = tasker
  .config()
  .credentialsProvider('cred1')
  .dependency('foo', 'abc')
  .dependency('bar', 123)
  .session('sess1', { credentials: 'cred1' }, {})
  .session('sess2', { parent: 'sess1' }, {})
  .source(
    'src1',
    { session: 'sess1', dependencies: ['bar'] },
    {
      getNumber: async ({ dependencies }, addNum: number) => {
        if (dependencies) {
          return dependencies.bar + addNum;
        } else {
          return addNum;
        }
      },
    }
  )
  .target(
    'trg1',
    {},
    {
      uploadDate: async (_, date: number) => {
        console.log(date);
        return 'OK';
      },
    }
  );

// type TC1 = typeof tc1;

const tc2 = tasker
  .config()
  .import(tc1)
  .task('task1', { dependencies: ['bar', 'foo'], sources: ['src1'], targets: ['trg1'] }, (steps) =>
    steps
      .step('step1', async (task) => {
        return await task.getFromSource('src1', 'getNumber', 23);
      })
      .step('step2', async (task, sum) => {
        const num = await task.getFromSource('src1', 'getNumber', 25);
        await task.sendToTarget('trg1', 'uploadDate', sum + num);
        task.log.debug('all good');
      })
  );

// type TC2 = typeof tc2;

tasker.run(tc2, 'debug');
