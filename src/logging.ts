import { consoleLogConsumerFactory, Logger } from '@kksiuda/logger';
import type { TaskerLogger } from './types/logger';
import type { Log } from './log-store';

import { LogStore, NoOpLogStore } from './log-store';

import { normalizeTaskerOptions } from './tasker-options';
export function getLogStoreLogger(options: ReturnType<typeof normalizeTaskerOptions>): [LogStore, TaskerLogger] {
  const { shouldLog, useLogStore, logConsole, logLevel, logConsumer } = options;
  const logStore = shouldLog && useLogStore ? new LogStore(options) : new NoOpLogStore();
  const consoleLogConsumer = logConsole ? consoleLogConsumerFactory() : () => undefined;
  const consoleLogConsumerWrapper = logConsole
    ? ({ timestamp, namespace, logLevel, message, details }: Log) => {
        consoleLogConsumer({ timestamp, namespace, logLevel, payload: details ? `${message}\n${details}` : message });
      }
    : () => undefined;
  const logger = new Logger<{ message: string; details?: string }>({
    logLevel,
    consumer: shouldLog
      ? (log) => {
          if (logConsumer) logConsumer(log);
          const normalizedLog = {
            timestamp: log.timestamp,
            namespace: log.namespace,
            logLevel: log.logLevel,
            message: log.payload.message,
            details: log.payload.details || '',
          };
          consoleLogConsumerWrapper(normalizedLog);
          if (useLogStore) logStore.addLog(normalizedLog);
        }
      : () => undefined,
  }).namespace('', (message: string, details?: string) => ({ message, details }));
  return [logStore, logger];
}
