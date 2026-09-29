/**
 * Short capture failures, classified the way FreeFlow classifies transcription
 * errors: connection and timeout first, then provider dumps hidden from the UI.
 */

export function presentCaptureError(raw: string, status?: number): string {
  const text = raw.replace(/key=[^&\s"']+/gi, "key=***").trim();
  const lower = text.toLowerCase();

  if (status === 401 || lower.includes("unauthorized") || lower.includes("session expired")) {
    return "Log out in Settings, then sign in again.";
  }
  if (status === 415 || lower.includes("unsupported audio")) {
    return "Try speaking again for a couple of seconds.";
  }
  if (status === 429 || lower.includes("too many")) {
    return "Wait a few seconds, then try again.";
  }
  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("took too long")
  ) {
    return "That took too long. Try again.";
  }
  if (
    lower.includes("failed to fetch") ||
    lower.includes("network request failed") ||
    lower.includes("network error") ||
    lower.includes("network connection") ||
    lower.includes("offline") ||
    lower.includes("not connected") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound")
  ) {
    return "Check your connection and try again.";
  }
  // Hermes: "AbortSignal.timeout is not a function (it is undefined)"
  if (lower.includes("is not a function") || lower.includes("abortsignal")) {
    return "Update Lock In from TestFlight, then try again.";
  }
  if (
    lower.includes("gemini") ||
    lower.includes("api key") ||
    lower.includes("openrouter") ||
    lower.includes("http ") ||
    lower.includes("transcription failed") ||
    lower.includes("empty transcript")
  ) {
    return "Transcription didn't come through. Try again.";
  }
  if (!text) return "Try again.";
  return text.slice(0, 180);
}
