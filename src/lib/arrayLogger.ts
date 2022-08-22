type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogFunction = (message: string, details?: string) => any;
type ArrayLogger = {
  debug: LogFunction;
  info: LogFunction;
  warn: LogFunction;
  error: LogFunction;
  namespace: (ns: string) => ArrayLogger;
};

interface Log {
  timestamp: number;
  level: LogLevel;
  message: string;
  details?: string;
  namespace: string;
}

export function arrayLogger(): [Log[], ArrayLogger] {
  const logs: Log[] = [];
  function logFunctionFactory(namespace: string, level: LogLevel): LogFunction {
    return (message, details) => logs.push({ level, message, details, namespace, timestamp: Date.now() });
  }
  function loggerFactory(namespace: string): ArrayLogger {
    return {
      debug: logFunctionFactory(namespace, 'debug'),
      info: logFunctionFactory(namespace, 'info'),
      warn: logFunctionFactory(namespace, 'warn'),
      error: logFunctionFactory(namespace, 'error'),
      namespace: (ns: string) => loggerFactory(namespace + '.' + ns),
    };
  }
  return [logs, loggerFactory('')];
}
