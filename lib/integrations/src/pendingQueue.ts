/** Statuses worth retrying later. A 429 is a slow-down, not an offline note. */
export function isRetryableCaptureStatus(status: number): boolean {
  return status === 408 || status >= 500;
}

/** Drop sent and permanently failed captures without erasing notes saved mid-flush. */
export function retainPending<T extends { id: string }>(
  latest: T[],
  sentIds: ReadonlySet<string>,
  dropIds: ReadonlySet<string>,
): T[] {
  return latest.filter((item) => !sentIds.has(item.id) && !dropIds.has(item.id));
}
