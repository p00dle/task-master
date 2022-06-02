import type { TaskerLogger } from './types/logger';
import type { DataApiDeps, DataApiOptions, DataApiStatus } from './types/data-api';
import { UtilityClass } from './lib/UtilityClass';

export class DataApi extends UtilityClass<DataApiStatus> {
  public status: DataApiStatus;
  constructor(
    protected name: string,
    protected api: DataApiOptions,
    protected getDependencies: () => Promise<DataApiDeps>,
    public logger: TaskerLogger
  ) {
    super();
    this.status = { name, lastTouched: {}, lastUpdated: {}, status: 'Ready', inQueue: 0 };
    for (const apiName of Object.keys(this.api)) {
      this.status.lastTouched[apiName] = null;
      this.status.lastUpdated[apiName] = null;
    }
  }
  public setLastUpdated(path: string, date: number | null) {
    this.logger.debug(`Last updated set to ${typeof date === 'number' ? new Date(date).toString() : 'null'}`);
    this.changeStatus({ lastUpdated: { ...this.status.lastUpdated, [path]: date } });
  }
  public getLastUpdated(path: string): number | null {
    return this.status.lastUpdated[path];
  }

  public async callApi(path: string, params: any) {
    const { session, dependencies } = await this.getDependencies();
    let err: any = null;
    try {
      this.changeStatus({ status: 'In Use', inQueue: this.status.inQueue + 1 });
      return await this.api[path]({ session, dependencies }, params);
    } catch (error) {
      err = error;
    } finally {
      if (session && !session.wasReleased) session.release();
      this.changeStatus({
        status: this.status.inQueue === 1 ? 'Ready' : 'In Use',
        inQueue: this.status.inQueue - 1,
        lastTouched: { ...this.status.lastTouched, [path]: Date.now() },
      });
      if (err) throw err;
    }
  }
}
