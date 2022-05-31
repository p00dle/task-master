function isErrorWithStack(error: any): error is { message: string; stack: string } {
  return error instanceof Error && typeof error.message === 'string' && typeof error.stack === 'string';
}
export async function asyncRetry<T>(
  task: () => Promise<T>,
  retries: number,
  logError: (message: string, stack: string) => any
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore the function will always either return T or throw an error
): Promise<T> {
  let tryCount = 0;
  do {
    try {
      return await task();
    } catch (err) {
      tryCount++;
      const isError = isErrorWithStack(err);
      if (tryCount < retries) {
        logError(isError ? err.message : String(err), isError ? err.stack : '');
      } else {
        throw err;
      }
    }
  } while (tryCount < retries);
}
