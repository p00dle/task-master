import type { Credentials } from '../credentials';
import type { Session } from '../sessions';

export type {
  HttpSessionOptions,
  HttpSessionStatusData,
  HttpSessionObject,
  HttpSessionSerializedData,
} from '@kksiuda/http-session';

export interface SessionDeps<P, C extends Credentials | void> {
  parentSession?: Session<P, any, any>;
  credentials?: C;
}
