import type { LogConsumer } from '@kksiuda/logger';

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
