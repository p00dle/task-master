export function errorCallBackPromise(): [Promise<void>, (err: any) => void] {
  let onResolve: () => void;
  let onReject: (err: any) => void;
  const promise = new Promise<void>((resolve, reject) => {
    onResolve = resolve;
    onReject = reject;
  });
  const cb = (err: any) => (err ? onReject(err) : onResolve());
  return [promise, cb];
}
