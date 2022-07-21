import { Readable } from 'node:stream';

export function isReadableStream(val: any): val is Readable {
  return !!val && typeof val.pipe === 'function';
}
