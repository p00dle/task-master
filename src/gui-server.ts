import { normalizeTaskerOptions } from './tasker-options';
import * as http from 'http';
import { Tasker } from './tasker';
import { createGuiRouter } from './gui-router';
import { openBrowser } from './lib/openBrowser';
export function createGuiServer(
  options: ReturnType<typeof normalizeTaskerOptions>,
  tasker: Tasker
): http.Server | null {
  const { useGui, guiPort, openInBrowser, localConnectionsOnly, longPollTimeout, logsFilename } = options;
  if (!useGui) return null;
  const router = createGuiRouter({
    logsFilename,
    localConnectionsOnly,
    longPollTimeout,
    tasker,
  });
  const server = http.createServer(router);
  server.on('listening', () => {
    if (tasker.isShutdown) {
      server.close();
    } else {
      console.info(`Server started; GUI available at http://localhost:${guiPort}`);
      if (openInBrowser) openBrowser(`http://localhost:${guiPort}`);
    }
  });
  server.on('error', (err) => console.error(err));
  server.listen(guiPort, 'localhost');
  return server;
}
