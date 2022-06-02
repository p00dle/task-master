import type { LogConsumer } from '@kksiuda/logger';
import type { CredentialsStatus } from './credentials';
import type { DataApiStatus } from './data-api';
import type { HttpSessionStatusData } from './session';
import type { TaskStatus } from './task';

export interface TaskerStatus {
  credentials: CredentialsStatus[];
  sessions: HttpSessionStatusData[];
  apis: (DataApiStatus<any> & { type: 'source' | 'target' })[];
  tasks: TaskStatus[];
}

export interface TaskerOptions {
  autostartTasks?: boolean;
  gui?:
    | false
    | {
        port?: number;
        openInBrowser?: boolean;
        localConnectionsOnly?: boolean;
        longPollTimeout?: number;
      };
  logs?:
    | false
    | {
        filename?: string;
        console?: boolean;
        store?: boolean;
        logHttpRequests?: boolean;
        logStatusChanges?: boolean;
        level?: 'debug' | 'info' | 'warn' | 'error';
        consumer?: LogConsumer<{ message: string; details?: string }>;
        useArchive?: boolean;
        archiveAfterMs?: number;
        retainArchivedLogs?: boolean;
        archiveIntervalMs?: number;
        memoryLimitMb?: number;
        memoryPurgeRatio?: number;
        dumpLogsOnExitToFilename?: string;
      };
}

export interface StatusTypeListener<K extends keyof TaskerStatus> {
  type: K;
  listener: (data: TaskerStatus[K]) => any;
}

export interface NormalizedTaskerOptions {
  forceStartTasks: boolean;
  useGui: boolean;
  guiPort: number;
  openInBrowser: boolean;
  localConnectionsOnly: boolean;
  longPollTimeout: number;
  shouldLog: boolean;
  logsFilename: string;
  logStatusChanges: boolean;
  logConsole: boolean;
  useLogStore: boolean;
  logHttpRequests: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  logConsumer: LogConsumer<{ message: string; details?: string }> | null;
  memoryLimitMb: number;
  memoryPurgeRatio: number;
  useArchive: boolean;
  archiveLogsAfterMs: number;
  retainArchivedLogs: boolean;
  archiveLogsIntervalMs: number;
  dumpLogsOnExitToFilename: string | null;
}
