let queue: Promise<unknown> = Promise.resolve();
export function withPlannerLock<T>(operation: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => {}).then(operation);
  queue = next;
  return next;
}
