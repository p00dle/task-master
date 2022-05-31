import { EventEmitter, Readable } from 'node:stream';
import { Express, Request, Response, NextFunction } from 'express';
import express from 'express';
import { Unsubscribe } from './types';
import { readFileSync } from 'node:fs';
import * as path from 'path';
function setCsvResponseMiddlewareFactory(filename: string) {
  return (_req: any, res: Response, next: NextFunction) => {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    next();
  };
}

const ALLOW_ADDRESSES = ['::ffff:127.0.0.1', '127.0.0.1'];
function allowOnlyLocalConnection(req: Request, res: Response, next: NextFunction) {
  const clientAddress = req.socket.remoteAddress || '';
  if (ALLOW_ADDRESSES.includes(clientAddress)) {
    next();
  } else {
    res.statusCode = 403;
    res.send('Forbidden');
  }
}

interface CreateGuiRouterParams {
  logStore: {
    get: (params: { limit: number; namespace?: string; logLevel?: 'debug' | 'info' | 'warn' | 'error' }) => any;
    subscribe: (
      params: { limit: number; namespace?: string; logLevel?: 'debug' | 'info' | 'warn' | 'error' },
      listener: (data: any) => any
    ) => Unsubscribe;
    getCsvStream: () => Readable;
  };
  subscribeToStatusChange: (
    type: 'credentials' | 'dataSources' | 'tasks' | 'sessions',
    listener: (data: any) => any
  ) => Unsubscribe;
  shutdown: () => Promise<void>;
  onSetCredential: (name: string, username: string, password: string) => any;
  onInvalidateSession: (name?: string) => any;
  onStartTask: (name?: string) => any;
  onForceStopTask: (name?: string) => any;
  logsFilename: string;
  localConnectionsOnly: boolean;
  longPollTimeout: number;
}

function getLogStoreParamsFromRequest(req: Request) {
  return {
    limit: parseInt(req.query.limit as string, 10) || 50,
    namespace: (req.query.namespace as string) || undefined,
    logLevel: req.query.debug === 'true' ? ('debug' as const) : ('info' as const),
  };
}

type DataPart = 'credentials' | 'sessions' | 'dataSources' | 'tasks';

export function createGuiRouter(params: CreateGuiRouterParams): Express {
  const {
    localConnectionsOnly,
    logsFilename,
    logStore,
    subscribeToStatusChange,
    longPollTimeout,
    shutdown,
    onStartTask,
    onForceStopTask,
    onInvalidateSession,
    onSetCredential,
  } = params;
  const router = express();
  if (localConnectionsOnly) {
    router.use(allowOnlyLocalConnection);
  }
  router.use(express.json());
  router.use(express.static(path.join(__dirname, 'gui')));
  router.set('etag', false);
  router.get('/api/download-logs', setCsvResponseMiddlewareFactory(logsFilename || 'logs'), (_, res) =>
    logStore.getCsvStream().pipe(res)
  );

  const data: any = {
    credentials: [],
    sessions: [],
    dataSources: [],
    tasks: [],
  };
  const lastUpdated = {
    credentials: Date.now(),
    sessions: Date.now(),
    dataSources: Date.now(),
    tasks: Date.now(),
  };
  let logsLastUpdated = Date.now();

  const spaHtml = readFileSync(__dirname + '/gui/index.html', { encoding: 'utf8' });
  router.get('/', (_req, res) => res.end(spaHtml));
  router.get('/credentials', (_req, res) => res.end(spaHtml));
  router.get('/tasks', (_req, res) => res.end(spaHtml));
  router.get('/data-sources', (_req, res) => res.end(spaHtml));
  router.get('/sessions', (_req, res) => res.end(spaHtml));
  router.get('/logs', (_req, res) => res.end(spaHtml));

  let forceStop = false;
  const dataChangeEventEmitter = new EventEmitter();
  function onDataChange(type: string, cb: (data: any) => any) {
    const listener = () => cb(data[type]);
    dataChangeEventEmitter.once(type, listener);
    return () => dataChangeEventEmitter.off(type, listener);
  }
  const timeoutHandles: { handle: NodeJS.Timeout; cb: () => any }[] = [];
  function setSafeTimeout(cb: () => any, ms: number): Unsubscribe {
    const handle = setTimeout(cb, ms);
    const obj = { handle, cb };
    timeoutHandles.push(obj);
    return () => {
      const index = timeoutHandles.indexOf(obj);
      if (index >= 0) timeoutHandles.splice(index, 1);
      clearTimeout(handle);
    };
  }
  const unsubscribers: Unsubscribe[] = [];
  unsubscribers.push(
    logStore.subscribe({ limit: 0 }, () => {
      logsLastUpdated = Date.now();
    })
  );
  for (const type of ['sessions', 'tasks', 'dataSources', 'credentials'] as const) {
    unsubscribers.push(
      subscribeToStatusChange(type, (newData) => {
        lastUpdated[type] = Date.now();
        data[type] = newData;
        if (!forceStop) {
          dataChangeEventEmitter.emit(type, newData);
        }
      })
    );
  }
  function longPoll(dataPart: DataPart) {
    return (req: Request, res: Response) => {
      const clientLastUpdate = req.query['last-updated'] ? parseInt(req.query['last-updated'] as string, 10) : null;
      if (!clientLastUpdate || clientLastUpdate < lastUpdated[dataPart]) {
        return res.json({
          lastUpdated: lastUpdated[dataPart],
          data: data[dataPart],
        });
      }
      let settled = false;
      const clearSafeTimeout = setSafeTimeout(onData, longPollTimeout);
      const unsubscribe = onDataChange(dataPart, onData);
      unsubscribers.push(unsubscribe);
      function onData() {
        if (forceStop) {
          settled = true;
          return res.end();
        }
        if (!settled) {
          settled = true;
          const unsubscribeIndex = unsubscribers.findIndex((fn) => fn === unsubscribe);
          if (unsubscribeIndex >= 0) unsubscribers.splice(unsubscribeIndex, 1);
          clearSafeTimeout();
          unsubscribe();
          res.json({
            lastUpdated: lastUpdated[dataPart],
            data: data[dataPart],
          });
        }
      }
    };
  }
  router.get('/api/credentials', longPoll('credentials'));
  router.get('/api/sessions', longPoll('sessions'));
  router.get('/api/data-sources', longPoll('dataSources'));
  router.get('/api/tasks', longPoll('tasks'));
  router.get('/api/shutdown', (_req, res) => {
    forceStop = true;
    for (const { handle, cb } of timeoutHandles) {
      clearTimeout(handle);
      cb();
    }
    for (const unsubscribe of unsubscribers) unsubscribe();
    shutdown();
    res.statusCode = 200;
    res.end();
  });
  router.get(
    '/api/logs',
    (req, res, next) => {
      if (req.query['long-poll'] === 'false') {
        res.json(logStore.get(getLogStoreParamsFromRequest(req)));
      } else {
        next();
      }
    },
    (req, res) => {
      const clientLastUpdate = req.query['last-updated'] ? parseInt(req.query['last-updated'] as string, 10) : null;
      const logParams = getLogStoreParamsFromRequest(req);
      if (!clientLastUpdate || clientLastUpdate < logsLastUpdated) {
        return res.json({
          lastUpdated: logsLastUpdated,
          data: logStore.get(logParams),
        });
      }
      let settled = false;
      const clearSafeTimeout = setSafeTimeout(() => onData(), longPollTimeout);
      const unsubscribe = logStore.subscribe(logParams, onData);
      unsubscribers.push(unsubscribe);
      function onData(logs?: any[]) {
        if (forceStop) {
          settled = true;
          return res.end();
        }
        if (!settled) {
          settled = true;
          const unsubscribeIndex = unsubscribers.findIndex((fn) => fn === unsubscribe);
          if (unsubscribeIndex >= 0) unsubscribers.splice(unsubscribeIndex, 1);
          clearSafeTimeout();
          unsubscribe();
          res.json({
            lastUpdated: logsLastUpdated,
            data: logs || logStore.get(logParams),
          });
        }
      }
    }
  );
  router.post('/api/tasks', (req, res) => {
    const isStop = req.query.command === 'stop';
    const taskName = req.query.name as string | undefined;
    if (isStop) {
      onForceStopTask(taskName);
    } else {
      onStartTask(taskName);
    }
    res.statusCode = 200;
    res.end();
  });
  router.post('/api/sessions', (req, res) => {
    const sessionName = req.query.name as string | undefined;
    onInvalidateSession(sessionName);
    res.statusCode = 200;
    res.end();
  });
  router.post('/api/credentials', (req, res) => {
    const username = req.body[`${req.body.name}_username`];
    const password = req.body[`${req.body.name}_password`];
    onSetCredential(req.body.name, username, password);
    res.statusCode = 200;
    res.end();
  });
  return router;
}
