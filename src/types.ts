export type Unsubscribe = () => void;

type LogFunction = (message: string, details?: string) => any;
export type TaskMasterLogger = {
  debug: LogFunction;
  info: LogFunction;
  warn: LogFunction;
  error: LogFunction;
  namespace: (ns: string) => TaskMasterLogger;
};
