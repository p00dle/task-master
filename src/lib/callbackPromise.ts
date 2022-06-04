export function callBackPromise(): [Promise<void>, () => void] {
  let onResolve: (() => void) | undefined = undefined;
  const promise = new Promise<void>((resolve) => {
    onResolve = resolve;
  });
  return [promise, onResolve as unknown as () => void];
}
