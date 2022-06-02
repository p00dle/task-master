type LogFunction = (message: string, details?: string) => any;
export type TaskerLogger = {
  debug: LogFunction;
  info: LogFunction;
  warn: LogFunction;
  error: LogFunction;
  namespace: (ns: string) => TaskerLogger;
};
