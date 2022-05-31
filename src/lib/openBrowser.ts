import { exec } from 'child_process';

const commands = (url: string) => {
  switch (process.platform) {
    case 'android':
    case 'linux':
      return `xdg-open ${url}`;
    case 'darwin':
      return `open ${url}`;
    case 'win32':
      return `cmd /c start ${url}`;
    default:
      throw new Error(`Platform ${process.platform} isn't supported.`);
  }
};

export function openBrowser(url: string): Promise<void> {
  return new Promise((resolve) => {
    exec(commands(url), (err) => {
      if (err) console.error(err);
      else resolve();
    });
  });
}
