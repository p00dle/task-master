import { Task } from '../src';
import { createMemoryDataApi } from '../src/memory-store';

describe('Task', () => {
  it('sets/gets target/source last updated time', async () => {
    const mem = createMemoryDataApi('mem-api1', { num: 0, str: 'abc', bool: false });
    const now = Date.now();
    let targetLastUpdated: any = null;
    let sourceLastUpdated: any = null;
    const task = new Task({
      name: 'task1',
      sources: { mem },
      targets: { mem },
      steps: [
        async function set(task) {
          task.setSourceLastUpdated('mem', now);
          task.setTargetLastUpdated('mem', now);
        },
        async function get(task) {
          sourceLastUpdated = task.getSourceLastUpdated('mem');
          targetLastUpdated = task.getTargetLastUpdated('mem');
        },
      ],
    });
    await task.execute();
    expect(sourceLastUpdated).toBe(now);
    expect(targetLastUpdated).toBe(now);
  });

  it('throws on setting/getting undefined target/source last updated time', async () => {
    let setTargetError: any = null;
    let setSourceError: any = null;
    let getTargetError: any = null;
    let getSourceError: any = null;
    const task = new Task({
      name: 'task2',
      steps: [
        async (task) => {
          try {
            task.setTargetLastUpdated('invalid name', null);
          } catch (err) {
            setTargetError = err;
          }
        },
        async (task) => {
          try {
            task.setSourceLastUpdated('invalid name', null);
          } catch (err) {
            setSourceError = err;
          }
        },
        async (task) => {
          try {
            task.getTargetLastUpdated('invalid name');
          } catch (err) {
            getTargetError = err;
          }
        },
        async (task) => {
          try {
            task.getSourceLastUpdated('invalid name');
          } catch (err) {
            getSourceError = err;
          }
        },
      ],
    });
    await task.execute();
    expect(setTargetError).not.toBeNull();
    expect(setSourceError).not.toBeNull();
    expect(getTargetError).not.toBeNull();
    expect(getSourceError).not.toBeNull();
  });

  it('throws on using an undefined dependency', async () => {
    let sourceError: any = null;
    let targetError: any = null;
    const task = new Task({
      name: 'task3',
      steps: [
        async (task) => {
          try {
            task.getFromSource('invalid name', 'wrong path', undefined);
          } catch (err) {
            sourceError = err;
          }
        },
        async (task) => {
          try {
            task.sendToTarget('invalid name', 'wrong path', undefined);
          } catch (err) {
            targetError = err;
          }
        },
      ],
    });
    await task.execute();
    expect(sourceError).not.toBeNull();
    expect(targetError).not.toBeNull();
  });
});
