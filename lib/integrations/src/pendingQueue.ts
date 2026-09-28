/** Statuses worth retrying later. A 429 is a slow-down, not an offline note. */
export function isRetryableCaptureStatus(status: number): boolean {
  return status === 408 || status >= 500;
}

/**
 * True when fetch never got a usable HTTP response (device offline, DNS, TLS, etc.).
 * Do not treat JSON/parse bugs or other client errors as "offline".
 */
export function isNetworkCaptureError(err: unknown): boolean {
  if (err == null) return false;
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (name === "TypeError" && /fetch|network|load failed|failed to fetch/i.test(message)) {
    return true;
  }
  return (
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("network error") ||
    lower.includes("network connection") ||
    lower.includes("the internet connection appears to be offline") ||
    lower.includes("not connected to the internet") ||
    lower.includes("offline") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("enotfound") ||
    lower.includes("etimedout") ||
    lower.includes("socket") ||
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("aborted")
  );
}

/** Drop sent and permanently failed captures without erasing notes saved mid-flush. */
export function retainPending<T extends { id: string }>(
  latest: T[],
  sentIds: ReadonlySet<string>,
  dropIds: ReadonlySet<string>,
): T[] {
  return latest.filter((item) => !sentIds.has(item.id) && !dropIds.has(item.id));
}
