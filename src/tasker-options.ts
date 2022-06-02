import type { NormalizedTaskerOptions, TaskerOptions } from './types/tasker';

const DEFAULT_OPTIONS: NormalizedTaskerOptions = {
  forceStartTasks: false,
  useGui: false,
  guiPort: 6699,
  openInBrowser: true,
  localConnectionsOnly: true,
  longPollTimeout: 20_000,
  shouldLog: false,
  logsFilename: 'logs',
  logConsole: false,
  useLogStore: false,
  logHttpRequests: false,
  logStatusChanges: false,
  logLevel: 'silent',
  logConsumer: null,
  useArchive: true,
  archiveLogsAfterMs: 86_400_000,
  retainArchivedLogs: false,
  archiveLogsIntervalMs: 3_600_000,
  memoryLimitMb: 256,
  memoryPurgeRatio: 0.8,
  dumpLogsOnExitToFilename: null,
};

const MANUAL_OPTIONS: NormalizedTaskerOptions = {
  forceStartTasks: false,
  useGui: true,
  guiPort: 6699,
  openInBrowser: true,
  localConnectionsOnly: true,
  longPollTimeout: 20_000,
  shouldLog: true,
  logsFilename: 'logs',
  logStatusChanges: false,
  logConsole: false,
  useLogStore: true,
  logHttpRequests: false,
  logLevel: 'info',
  useArchive: true,
  archiveLogsAfterMs: 86_400_000,
  retainArchivedLogs: true,
  archiveLogsIntervalMs: 3_600_000,
  logConsumer: null,
  memoryLimitMb: 256,
  memoryPurgeRatio: 0.8,
  dumpLogsOnExitToFilename: null,
};

const PRODUCTION_OPTIONS: NormalizedTaskerOptions = {
  forceStartTasks: false,
  useGui: false,
  guiPort: 6699,
  openInBrowser: false,
  localConnectionsOnly: true,
  longPollTimeout: 20_000,
  shouldLog: true,
  logsFilename: 'logs',
  logStatusChanges: false,
  logConsole: false,
  useLogStore: true,
  logHttpRequests: false,
  logLevel: 'warn',
  useArchive: false,
  archiveLogsAfterMs: Infinity,
  retainArchivedLogs: false,
  archiveLogsIntervalMs: Infinity,
  logConsumer: null,
  memoryLimitMb: 256,
  memoryPurgeRatio: 0.8,
  dumpLogsOnExitToFilename: null,
};

const DEBUG_OPTIONS: NormalizedTaskerOptions = {
  forceStartTasks: false,
  useGui: true,
  guiPort: 6699,
  openInBrowser: false,
  localConnectionsOnly: true,
  longPollTimeout: 20_000,
  shouldLog: true,
  logsFilename: 'logs',
  logStatusChanges: true,
  logConsole: false,
  useLogStore: true,
  logHttpRequests: true,
  logLevel: 'debug',
  useArchive: false,
  archiveLogsAfterMs: Infinity,
  retainArchivedLogs: false,
  archiveLogsIntervalMs: Infinity,
  logConsumer: null,
  memoryLimitMb: 512,
  memoryPurgeRatio: 0.8,
  dumpLogsOnExitToFilename: null,
};

const guiOptionsMap: Record<string, keyof NormalizedTaskerOptions> = {
  port: 'guiPort',
  openInBrowser: 'openInBrowser',
  localConnectionsOnly: 'localConnectionsOnly',
  longPollTimeout: 'longPollTimeout',
};

const logOptionsMap: Record<string, keyof NormalizedTaskerOptions> = {
  filename: 'logsFilename',
  console: 'logConsole',
  store: 'useLogStore',
  logHttpRequests: 'logHttpRequests',
  logStatusChanges: 'logStatusChanges',
  level: 'logLevel',
  consumer: 'logConsumer',
  useArchive: 'useArchive',
  archiveAfterMs: 'archiveLogsAfterMs',
  retainArchivedLogs: 'retainArchivedLogs',
  archiveIntervalMs: 'archiveLogsIntervalMs',
  memoryLimitMb: 'memoryLimitMb',
  memoryPurgeRatio: 'memoryPurgeRatio',
  dumpLogsOnExitToFilename: 'dumpLogsOnExitToFilename',
};

export function normalizeTaskerOptions(
  options: 'manual' | 'prod' | 'debug' | TaskerOptions = {}
): NormalizedTaskerOptions {
  if (options === 'manual') return MANUAL_OPTIONS;
  if (options === 'debug') return DEBUG_OPTIONS;
  if (options === 'prod') return PRODUCTION_OPTIONS;
  const output: any = { ...DEFAULT_OPTIONS };
  if (options.autostartTasks) output.forceStartTasks = true;
  if (options.gui) {
    output.useGui = true;
    for (const [key, outputKey] of Object.entries(guiOptionsMap)) {
      if (options.gui[key] !== undefined) output[outputKey] = options.gui[key] as any;
    }
  }
  if (options.logs) {
    output.shouldLog = true;
    for (const [key, outputKey] of Object.entries(logOptionsMap)) {
      if (options.logs[key] !== undefined) output[outputKey] = options.logs[key] as any;
    }
  }
  return output;
}
