export function callBackPromise(): [Promise<void>, () => void] {
  let onResolve: () => void;
  const promise = new Promise<void>((resolve) => {
    onResolve = resolve;
  });
  return [promise, onResolve];
}
