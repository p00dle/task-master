import { EventEmitter } from 'node:stream';
import { Express, Request, Response, NextFunction } from 'express';
import express from 'express';
import { readFileSync } from 'node:fs';
import * as path from 'path';
import { Tasker } from './tasker';
import { TaskerStatus } from './types/tasker';
import { Unsubscribe } from './types/unsubscribe';
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
  tasker: Tasker;
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

type DataPart = keyof TaskerStatus;

export function createGuiRouter(params: CreateGuiRouterParams): Express {
  const { tasker, localConnectionsOnly, logsFilename, longPollTimeout } = params;
  const router = express();
  if (localConnectionsOnly) {
    router.use(allowOnlyLocalConnection);
  }
  router.use(express.json());
  router.use(express.static(path.join(__dirname, '../gui')));
  router.set('etag', false);
  router.get('/api/download-logs', setCsvResponseMiddlewareFactory(logsFilename || 'logs'), (_, res) =>
    tasker.logStore.getCsvStream().pipe(res)
  );

  const data: TaskerStatus = {
    credentials: [],
    sessions: [],
    apis: [],
    tasks: [],
  };
  const lastUpdated: Record<DataPart, number> = {
    credentials: Date.now(),
    sessions: Date.now(),
    apis: Date.now(),
    tasks: Date.now(),
  };
  let logsLastUpdated = Date.now();

  const spaHtml = readFileSync(path.join(__dirname, '../gui/index.html'), { encoding: 'utf8' });
  router.get('/', (_req, res) => res.end(spaHtml));
  router.get('/credentials', (_req, res) => res.end(spaHtml));
  router.get('/tasks', (_req, res) => res.end(spaHtml));
  router.get('/apis', (_req, res) => res.end(spaHtml));
  router.get('/sessions', (_req, res) => res.end(spaHtml));
  router.get('/logs', (_req, res) => res.end(spaHtml));

  let forceStop = false;
  const dataChangeEventEmitter = new EventEmitter();
  function onDataChange(type: DataPart, cb: (data: any) => any) {
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
  tasker.logStore.subscribe({ limit: 0 }, () => {
    logsLastUpdated = Date.now();
  });
  for (const type of ['sessions', 'tasks', 'apis', 'credentials'] as const) {
    tasker.onPartialStatus({
      type,
      listener: (newData) => {
        console.log({ type, newData });
        lastUpdated[type] = Date.now();
        data[type] = newData as any[];
        if (!forceStop) {
          dataChangeEventEmitter.emit(type, newData);
        }
      },
    });
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
      function onData() {
        if (forceStop) {
          settled = true;
          return res.end();
        }
        if (!settled) {
          settled = true;
          unsubscribe();
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
  router.get('/api/apis', longPoll('apis'));
  router.get('/api/tasks', longPoll('tasks'));
  router.get('/api/shutdown', (_req, res) => {
    forceStop = true;
    for (const { handle, cb } of timeoutHandles) {
      clearTimeout(handle);
      cb();
    }
    tasker.shutdown();
    res.statusCode = 200;
    res.end();
  });
  router.get(
    '/api/logs',
    (req, res, next) => {
      if (req.query['long-poll'] === 'false') {
        res.json(tasker.logStore.get(getLogStoreParamsFromRequest(req)));
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
          data: tasker.logStore.get(logParams),
        });
      }
      let settled = false;
      const clearSafeTimeout = setSafeTimeout(() => onData(), longPollTimeout);
      const unsubscribe = tasker.logStore.subscribe(logParams, onData);
      function onData(logs?: any[]) {
        if (forceStop) {
          settled = true;
          return res.end();
        }
        if (!settled) {
          settled = true;
          unsubscribe();
          clearSafeTimeout();
          unsubscribe();
          res.json({
            lastUpdated: logsLastUpdated,
            data: logs || tasker.logStore.get(logParams),
          });
        }
      }
    }
  );
  router.post('/api/tasks', (req, res) => {
    const isStop = req.query.command === 'stop';
    const taskName = req.query.name as string | undefined;
    if (isStop) {
      tasker.stopTask(taskName);
    } else {
      tasker.startTask(taskName);
    }
    res.statusCode = 200;
    res.end();
  });
  router.post('/api/sessions', (req, res) => {
    const sessionName = req.query.name as string | undefined;
    tasker.invalidateSession(sessionName);
    res.statusCode = 200;
    res.end();
  });
  router.post('/api/credentials', (req, res) => {
    const username = req.body[`${req.body.name}_username`];
    const password = req.body[`${req.body.name}_password`];
    tasker.setCredentials(req.body.name, { username, password });
    res.statusCode = 200;
    res.end();
  });
  return router;
}
