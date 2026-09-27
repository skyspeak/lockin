const EXPO_PUSH_TOKEN = /^(Exponent|Expo)PushToken\[[^\]]+\]$/;
const MORNING_START_HOUR = 8;
const MORNING_END_HOUR = 10;

export function isExpoPushToken(token: string): boolean {
  return EXPO_PUSH_TOKEN.test(token.trim());
}

export function shouldRemindSnooze(
  snoozedUntil: Date | null,
  remindedUntil: Date | null,
  now: Date,
): boolean {
  if (!snoozedUntil || snoozedUntil.getTime() > now.getTime()) return false;
  if (!remindedUntil) return true;
  return remindedUntil.getTime() < snoozedUntil.getTime();
}

export function hourInTimeZone(now: Date, timeZone: string): number {
  const part = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .find((item) => item.type === "hour");
  return Number(part?.value ?? "0");
}

export function localDateKey(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function inMorningReminderWindow(now: Date, timeZone = "America/Los_Angeles"): boolean {
  const hour = hourInTimeZone(now, timeZone);
  return hour >= MORNING_START_HOUR && hour < MORNING_END_HOUR;
}

export function snoozeReminder(title: string): { title: string; body: string } {
  return { title: "Back on your list", body: title.trim().slice(0, 140) || "A snoozed task is ready" };
}

export function morningReminder(titles: string[]): { title: string; body: string } | null {
  const clean = titles.map((title) => title.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  if (clean.length === 1) return { title: "Still open", body: clean[0].slice(0, 140) };
  const extra = clean.length - 1;
  return {
    title: "Still open",
    body: `${clean[0].slice(0, 80)} and ${extra} more`,
  };
}
