import type { CredentialsData } from './credentials';

import type {
  HttpSessionOptions,
  HttpSessionStatusData,
  HttpSessionObject,
  HttpSessionSerializedData,
} from '@kksiuda/http-session';

export type SessionOptions<S = any> = HttpSessionOptions<S>;
export type SessionStatus = HttpSessionStatusData;
export type SessionObject<S = any> = HttpSessionObject<S>;
export type SessionData<S = any> = HttpSessionSerializedData<S>;

export interface SessionDeps {
  parentSession?: SessionObject;
  credentials?: CredentialsData;
  validateCredentials?: (valid: boolean) => any;
}

export interface SessionDepsOptions<S = any, C = any> {
  parent?: S;
  credentials?: C;
}
