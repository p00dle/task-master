import { createStringifyCsvStream, CsvColumns } from '@kksiuda/csv';
import { Readable } from 'node:stream';
import { Unsubscribe } from './types/unsubscribe';

type Level = 'debug' | 'info' | 'warn' | 'error';

export interface Log {
  timestamp: number;
  logLevel: Level;
  namespace: string;
  message: string;
  details?: string;
}

export interface GetLogsParams {
  limit: number;
  namespace?: string;
  logLevel?: Level;
}

type LogListener = (logs: Log[]) => any;

function getApproximateLogSizeBytes(log: Log): number {
  return (
    60 +
    (log.namespace.length +
      (typeof log.message === 'string' ? log.message.length : 0) +
      (typeof log.details === 'string' ? log.details.length : 0)) *
      2
  );
}

function isAboveLogLevel(logLevel: Level, level: Level): boolean {
  switch (level) {
    case 'debug':
      return true;
    case 'error':
      return logLevel === 'error';
    case 'warn':
      return logLevel === 'error' || logLevel === 'warn';
    case 'info':
      return logLevel !== 'debug';
  }
}

const csvColumns: CsvColumns<Log> = [
  { prop: 'timestamp', type: 'datetime', csvProp: 'Timestamp' },
  { prop: 'logLevel', type: 'string', csvProp: 'Level' },
  { prop: 'namespace', type: 'string', csvProp: 'Namespace' },
  { prop: 'message', type: 'string', csvProp: 'Message' },
  { prop: 'details', type: 'string', csvProp: 'Details' },
];

interface LogStoreOptions {
  useArchive: boolean;
  archiveLogsAfterMs: number;
  retainArchivedLogs: boolean;
  archiveLogsIntervalMs: number;
  memoryLimitMb: number;
  memoryPurgeRatio: number;
}

export class LogStore {
  protected archivedLogs: Log[] = [];
  protected logs: Log[] = [];
  protected listeners: { params: GetLogsParams; listener: LogListener }[] = [];
  protected archiveTimeout: NodeJS.Timeout | null = null;
  protected archivedLogsSize: number[] = [];
  protected logsSize: number[] = [];
  protected totalSize = 0;
  protected useArchive: boolean;
  protected archiveAfterMs: number;
  protected retainArchivedLogs: boolean;
  protected archiveIntervalMs: number;
  protected memoryLimit: number;
  protected memoryPurgeTo: number;
  constructor(options: LogStoreOptions) {
    const {
      useArchive,
      archiveLogsAfterMs,
      retainArchivedLogs,
      archiveLogsIntervalMs,
      memoryLimitMb,
      memoryPurgeRatio,
    } = options;
    this.useArchive = useArchive;
    this.archiveAfterMs = archiveLogsAfterMs;
    this.retainArchivedLogs = retainArchivedLogs;
    this.archiveIntervalMs = archiveLogsIntervalMs;
    if (useArchive) this.archiveTimeout = setTimeout(() => this.archiveLogs(), archiveLogsIntervalMs);
    this.memoryLimit = memoryLimitMb * 1024 * 1024;
    this.memoryPurgeTo = (this.memoryLimit * memoryPurgeRatio) | 0;
  }

  public get({ limit, namespace, logLevel = 'debug' }: GetLogsParams): Log[] {
    const outputLogs = [];
    let i = this.logs.length;
    let count = 0;
    while (i-- && count < limit) {
      const log = this.logs[i];
      if (namespace) {
        if (log.namespace !== namespace) continue;
      }
      if (!isAboveLogLevel(log.logLevel, logLevel)) continue;
      outputLogs.push(log);
      count++;
    }
    return outputLogs;
  }

  public shutdown() {
    if (this.archiveTimeout) clearTimeout(this.archiveTimeout);
  }

  protected archiveLogs() {
    const now = Date.now();
    const logsLength = this.logs.length;
    let cutOffIndex = 0;
    while (cutOffIndex < logsLength && now - this.logs[cutOffIndex].timestamp > this.archiveAfterMs) {
      cutOffIndex++;
    }
    if (this.retainArchivedLogs) {
      this.archivedLogs = this.archivedLogs.concat(this.logs.slice(0, cutOffIndex));
      this.archivedLogsSize = this.archivedLogsSize.concat(this.logsSize.slice(0, cutOffIndex));
    }
    this.logs = this.logs.slice(cutOffIndex);
    this.logsSize = this.logsSize.slice(cutOffIndex);
    const scheduleUsingLogTimestamp = (this.logs[0] ? this.logs[0].timestamp : now) + this.archiveAfterMs;
    const scheduleUsingInterval = now + this.archiveIntervalMs;
    this.archiveTimeout = setTimeout(
      () => this.archiveLogs(),
      scheduleUsingLogTimestamp > scheduleUsingInterval ? scheduleUsingLogTimestamp - now : this.archiveIntervalMs
    );
  }

  protected downsizeLogs() {
    const targetReduction = this.totalSize - this.memoryPurgeTo;
    let reduced = 0;
    if (this.retainArchivedLogs) {
      const archiveLogsLength = this.archivedLogsSize.length;
      let removeCount = 0;
      for (let i = 0; i < archiveLogsLength; i++) {
        if (reduced >= targetReduction) break;
        reduced += this.archivedLogsSize[i];
        removeCount = i;
      }
      this.archivedLogs = this.archivedLogs.slice(removeCount);
      this.archivedLogsSize = this.archivedLogsSize.slice(removeCount);
      if (reduced >= targetReduction) return;
    }
    const logsLength = this.logsSize.length;
    let removeCount = 0;
    for (let i = 0; i < logsLength; i++) {
      if (reduced >= targetReduction) break;
      reduced += this.logsSize[i];
      removeCount = i;
    }
    this.logs = this.logs.slice(removeCount);
    this.logsSize = this.logsSize.slice(removeCount);
    if (reduced >= targetReduction) return;
  }
  public addLog(log: Log) {
    this.logs.push(log);
    const size = getApproximateLogSizeBytes(log);
    this.logsSize.push(size);
    this.totalSize += size;
    if (this.totalSize >= this.memoryLimit) this.downsizeLogs();
    this.listeners.forEach(({ params, listener }) => {
      listener(params.limit === 0 ? [] : this.get(params));
    });
  }

  public subscribe(params: GetLogsParams, listener: LogListener): Unsubscribe {
    const listenerParams = { params, listener };
    this.listeners.push(listenerParams);
    return () => {
      const index = this.listeners.indexOf(listenerParams);
      if (index >= 0) this.listeners.splice(index, 1);
    };
  }

  public getCsvStream(): Readable {
    const logs = this.useArchive ? this.archivedLogs.concat(this.logs) : this.logs;
    const logLength = logs.length;
    let count = 0;
    const logObjectStream = new Readable({
      objectMode: true,
      read() {
        if (count >= logLength) this.push(null);
        else this.push(logs[count++]);
      },
    });
    const stringifyStream = createStringifyCsvStream(csvColumns);
    logObjectStream.pipe(stringifyStream);
    return stringifyStream;
  }
}

export class NoOpLogStore extends LogStore {
  protected logs: Log[] = [];
  protected archivedLogs: Log[] = [];
  protected listeners: { params: GetLogsParams; listener: LogListener }[] = [];
  protected archiveTimeout = 0 as unknown as NodeJS.Timeout;
  protected useArchive = false;
  protected archiveAfterMs = 0;
  protected retainArchivedLogs = false;
  protected archiveIntervalMs = 0;
  constructor() {
    super({
      useArchive: false,
      archiveLogsAfterMs: 0,
      retainArchivedLogs: false,
      archiveLogsIntervalMs: 0,
      memoryLimitMb: 0,
      memoryPurgeRatio: 0,
    });
  }
  public get(): Log[] {
    return [];
  }
  public forceStop() {
    //
  }
  public addLog(_log: Log) {
    //
  }
  public subscribe(_params: GetLogsParams, _listener: LogListener): Unsubscribe {
    return () => undefined;
  }
  public getCsvStream(): Readable {
    return new Readable({
      read() {
        this.push('Timestamp,Level,Namespace,Message,Details\n');
        this.push(null);
      },
    });
  }
  protected archiveLogs() {
    //
  }
}
