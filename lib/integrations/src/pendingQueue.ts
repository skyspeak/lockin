/** Statuses worth retrying later. A 429 is a slow-down, not an offline note. */
export function isRetryableCaptureStatus(status: number): boolean {
  return status === 408 || status >= 500;
}

/**
 * True when fetch never got a usable HTTP response (device offline, DNS, TLS).
 * Proxy timeouts / aborts after a long server call are NOT "offline" — those
 * often mean the capture already landed and the socket died during enrich.
 */
export function isNetworkCaptureError(err: unknown): boolean {
  if (err == null) return false;
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();

  if (name === "AbortError" || lower.includes("aborted") || lower.includes("timed out") || lower.includes("timeout")) {
    return false;
  }

  if (name === "TypeError" && /fetch|network|load failed|failed to fetch/i.test(message)) {
    return true;
  }
  return (
    lower.includes("network request failed") ||
    lower.includes("failed to fetch") ||
    lower.includes("network error") ||
    lower.includes("network connection was lost") ||
    lower.includes("the internet connection appears to be offline") ||
    lower.includes("not connected to the internet") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound")
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
