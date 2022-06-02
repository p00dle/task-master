import type { NormalizedTaskerOptions, TaskerOptions } from './types/tasker';

const DEFAULT_OPTIONS = {
  autostartTasks: false,
  gui: {
    port: 6699,
    openInBrowser: false,
    localConnectionsOnly: true,
    longPollTimeout: 20_000,
  },
  logs: {
    filename: 'logs',
    console: false,
    store: false,
    logHttpRequests: false,
    level: 'debug' as const,
    consumer: null,
    useArchive: true,
    archiveAfterMs: 86_400_000,
    retainArchivedLogs: false,
    archiveIntervalMs: 3_600_000,
    memoryLimitMb: 256,
    memoryPurgeRatio: 0.8,
    dumpLogsOnExitToFilename: null,
  },
};

const MANUAL_OPTIONS: ReturnType<typeof normalizeTaskerOptions> = {
  forceStartTasks: false,
  useGui: true,
  guiPort: 6699,
  openInBrowser: true,
  localConnectionsOnly: true,
  longPollTimeout: 20_000,
  shouldLog: true,
  logsFilename: 'logs',
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

export function normalizeTaskerOptions(
  options: 'manual' | 'prod' | 'debug' | TaskerOptions = {}
): NormalizedTaskerOptions {
  if (options === 'manual') return MANUAL_OPTIONS;
  if (options === 'debug') return DEBUG_OPTIONS;
  if (options === 'prod') return PRODUCTION_OPTIONS;
  return {
    forceStartTasks: options.autostartTasks || DEFAULT_OPTIONS.autostartTasks,
    useGui: !!options.gui ? true : false,
    guiPort: (options.gui && options.gui.port) || DEFAULT_OPTIONS.gui.port,
    openInBrowser: (options.gui && options.gui.openInBrowser) || DEFAULT_OPTIONS.gui.openInBrowser,
    localConnectionsOnly:
      options.gui && typeof options.gui.localConnectionsOnly !== 'undefined'
        ? options.gui.localConnectionsOnly
        : DEFAULT_OPTIONS.gui.localConnectionsOnly,
    longPollTimeout: (options.gui && options.gui.longPollTimeout) || DEFAULT_OPTIONS.gui.longPollTimeout,
    shouldLog: typeof options.logs === 'boolean' ? options.logs : true,
    logsFilename: (options.logs && options.logs.filename) || DEFAULT_OPTIONS.logs.filename,
    logConsole: (options.logs && options.logs.console) || DEFAULT_OPTIONS.logs.console,
    useLogStore: (options.logs && options.logs.store) || DEFAULT_OPTIONS.logs.store,
    logHttpRequests: (options.logs && options.logs.logHttpRequests) || DEFAULT_OPTIONS.logs.logHttpRequests,
    logLevel: (options.logs && options.logs.level) || DEFAULT_OPTIONS.logs.level,
    logConsumer: (options.logs && options.logs.consumer) || DEFAULT_OPTIONS.logs.consumer,
    memoryLimitMb: (options.logs && options.logs.memoryLimitMb) || DEFAULT_OPTIONS.logs.memoryLimitMb,
    memoryPurgeRatio: (options.logs && options.logs.memoryPurgeRatio) || DEFAULT_OPTIONS.logs.memoryPurgeRatio,
    useArchive: typeof options.logs === 'boolean' ? options.logs : DEFAULT_OPTIONS.logs.useArchive,
    archiveLogsAfterMs: (options.logs && options.logs.archiveAfterMs) || DEFAULT_OPTIONS.logs.archiveAfterMs,
    retainArchivedLogs: (options.logs && options.logs.retainArchivedLogs) || DEFAULT_OPTIONS.logs.retainArchivedLogs,
    archiveLogsIntervalMs: (options.logs && options.logs.archiveIntervalMs) || DEFAULT_OPTIONS.logs.archiveIntervalMs,
    dumpLogsOnExitToFilename:
      (options.logs && options.logs.dumpLogsOnExitToFilename) || DEFAULT_OPTIONS.logs.dumpLogsOnExitToFilename,
  };
}
