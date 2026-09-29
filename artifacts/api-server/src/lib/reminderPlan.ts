const EXPO_PUSH_TOKEN = /^(Exponent|Expo)PushToken\[[^\]]+\]$/;

export type ScheduledReminderKind = "midday" | "afternoon";

/** Open-task nudges in America/Los_Angeles local time. Windows are one hour wide. */
export const SCHEDULED_REMINDERS: Array<{
  kind: ScheduledReminderKind;
  hour: number;
  title: string;
}> = [
  { kind: "midday", hour: 13, title: "Lock In check-in" },
  { kind: "afternoon", hour: 17, title: "Lock In check-in" },
];

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

export function inScheduledReminderWindow(
  hour: number,
  now: Date,
  timeZone = "America/Los_Angeles",
): boolean {
  return hourInTimeZone(now, timeZone) === hour;
}

/** @deprecated Prefer SCHEDULED_REMINDERS + inScheduledReminderWindow */
export function inMorningReminderWindow(now: Date, timeZone = "America/Los_Angeles"): boolean {
  const hour = hourInTimeZone(now, timeZone);
  return hour >= 8 && hour < 10;
}

export function snoozeReminder(title: string): { title: string; body: string } {
  return { title: "Back on your list", body: title.trim().slice(0, 140) || "A snoozed task is ready" };
}

export function openTasksReminder(
  titles: string[],
  headline = "Lock In check-in",
): { title: string; body: string } | null {
  const clean = titles.map((title) => title.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  if (clean.length === 1) return { title: headline, body: clean[0].slice(0, 140) };
  const extra = clean.length - 1;
  return {
    title: headline,
    body: `${clean[0].slice(0, 80)} and ${extra} more`,
  };
}

/** @deprecated Prefer openTasksReminder */
export function morningReminder(titles: string[]): { title: string; body: string } | null {
  return openTasksReminder(titles, "Still open");
}
