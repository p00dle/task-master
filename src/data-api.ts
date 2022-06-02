import type { TaskerLogger } from './types/logger';
import type { DataApiDeps, DataApiOptions, DataApiStatus } from './types/data-api';
import { UtilityClass } from './lib/UtilityClass';

export class DataApi extends UtilityClass<DataApiStatus> {
  protected status: DataApiStatus;
  constructor(
    protected name: string,
    protected api: DataApiOptions,
    protected getDependencies: () => Promise<DataApiDeps>,
    protected logger: TaskerLogger
  ) {
    super();
    this.status = { name, lastTouched: {}, lastUpdated: {} };
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
      return await this.api[path]({ session, dependencies }, params);
    } catch (error) {
      err = error;
    } finally {
      if (session && !session.wasReleased) session.release();
      this.changeStatus({ lastTouched: { ...this.status.lastTouched, [path]: Date.now() } });
      if (err) throw err;
    }
  }
}
