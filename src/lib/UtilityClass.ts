import { EventEmitter } from 'node:stream';
import { merge } from './merge';

type Unsubscribe = () => any;
type CancelTimeout = () => any;

export abstract class UtilityClass<S> {
  constructor() {
    this.emitStatusChange = this.emitStatusChange.bind(this);
  }
  protected emitter = new EventEmitter();
  protected abstract status: S;
  protected emitScheduleHandle: NodeJS.Immediate | null = null;
  protected timeouts: { handle: NodeJS.Timeout; cb: () => any; callOnClearAll: boolean }[] = [];

  public onStatus(listener: (status: S) => any): Unsubscribe {
    this.emitter.on('status-change', listener);
    listener(this.status);
    return () => this.emitter.off('status-change', listener);
  }

  protected emitStatusChange() {
    this.emitter.emit('status-change', this.status);
    this.emitScheduleHandle = null;
  }

  protected scheduleEmit() {
    if (this.emitScheduleHandle) return;
    this.emitScheduleHandle = setImmediate(this.emitStatusChange);
  }

  protected changeStatus(status: Partial<S>) {
    let statusHasChanged = false;
    for (const key of Object.keys(status) as (keyof S)[]) {
      if (status[key] !== this.status[key]) {
        statusHasChanged = true;
        break;
      }
    }
    if (!statusHasChanged) return;
    this.status = merge(this.status, status);
    this.scheduleEmit();
  }

  protected setTimeout(cb: () => any, ms: number, callOnClearAll = true): CancelTimeout {
    const handle = setTimeout(cb, ms);
    const timeoutCallback = { handle, cb, callOnClearAll };
    this.timeouts.push(timeoutCallback);
    return () => {
      const index = this.timeouts.indexOf(timeoutCallback);
      if (index >= 0) this.timeouts.splice(index, 1);
      clearTimeout(handle);
    };
  }

  public clearAllTimeouts() {
    if (this.emitScheduleHandle) {
      clearImmediate(this.emitScheduleHandle);
      this.emitStatusChange();
    }
    this.timeouts.forEach(({ handle, cb, callOnClearAll }) => {
      clearTimeout(handle);
      if (callOnClearAll) cb();
    });
  }
}
