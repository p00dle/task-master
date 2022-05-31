import { EventEmitter } from 'node:stream';

type Unsubscribe = () => any;

function canBeDestructured(val: any): val is Record<string, unknown> {
  return val && typeof val === 'object';
}

export abstract class StatusClass<S> {
  protected emitter = new EventEmitter();
  protected abstract status: S;
  protected onStatus(listener: (status: S) => any): Unsubscribe {
    this.emitter.on('status-change', listener);
    listener(this.status);
    return () => this.emitter.off('status-change', listener);
  }
  protected changeStatus(status: Partial<S>) {
    if (canBeDestructured(this.status) && canBeDestructured(status)) this.status = { ...this.status, status };
    else this.status = status as S;
    this.emitter.emit('status-change', this.status);
  }
}
