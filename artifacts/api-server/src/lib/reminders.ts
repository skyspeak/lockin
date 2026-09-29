import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db, pool, actionsTable, pushRemindersTable, pushTokensTable } from "@workspace/db";
import { logger } from "./logger";
import {
  inScheduledReminderWindow,
  localDateKey,
  openTasksReminder,
  SCHEDULED_REMINDERS,
  shouldRemindSnooze,
  snoozeReminder,
  type ScheduledReminderKind,
} from "./reminderPlan";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const OPEN_STATUSES = ["pending", "in-progress"] as const;
const TIME_ZONE = "America/Los_Angeles";

type ExpoTicket = {
  status?: string;
  details?: { error?: string };
};

type PushMessage = {
  to: string;
  title: string;
  body: string;
  sound: "default";
  channelId: string;
  data?: { actionId?: number };
};

export async function runReminders(
  now = new Date(),
): Promise<{ snooze: number; scheduled: Record<string, number> }> {
  const tokens = await db.select().from(pushTokensTable);
  if (tokens.length === 0) return { snooze: 0, scheduled: {} };

  const byUser = new Map<string, string[]>();
  for (const row of tokens) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row.token);
    byUser.set(row.userId, list);
  }
  const userIds = [...byUser.keys()];

  const due = await db
    .select({
      id: actionsTable.id,
      userId: actionsTable.userId,
      title: actionsTable.title,
      snoozedUntil: actionsTable.snoozedUntil,
      snoozeRemindedUntil: actionsTable.snoozeRemindedUntil,
    })
    .from(actionsTable)
    .where(
      and(
        inArray(actionsTable.userId, userIds),
        inArray(actionsTable.status, [...OPEN_STATUSES]),
        lte(actionsTable.snoozedUntil, now),
      ),
    );

  const snoozeDue = due.filter((action) =>
    shouldRemindSnooze(action.snoozedUntil, action.snoozeRemindedUntil, now),
  );

  const dropTokens = new Set<string>();
  const remindedIds: number[] = [];
  const snoozeMessages: PushMessage[] = [];
  const snoozeActionIds: number[] = [];

  for (const action of snoozeDue) {
    const destinations = byUser.get(action.userId) ?? [];
    const note = snoozeReminder(action.title);
    for (const token of destinations) {
      snoozeMessages.push({
        to: token,
        title: note.title,
        body: note.body,
        sound: "default",
        channelId: "reminders",
        data: { actionId: action.id },
      });
      snoozeActionIds.push(action.id);
    }
  }

  const snoozeResults = await sendExpoPush(snoozeMessages);
  snoozeResults.forEach((result, index) => {
    if (result.ok) remindedIds.push(snoozeActionIds[index] ?? -1);
    if (result.drop) dropTokens.add(snoozeMessages[index]?.to ?? "");
  });

  const uniqueReminded = [...new Set(remindedIds.filter((id) => id > 0))];
  if (uniqueReminded.length > 0) {
    await pool.query(
      "UPDATE actions SET snooze_reminded_until = snoozed_until WHERE id = ANY($1::int[])",
      [uniqueReminded],
    );
  }

  const scheduled: Record<string, number> = {};
  for (const slot of SCHEDULED_REMINDERS) {
    if (!inScheduledReminderWindow(slot.hour, now, TIME_ZONE)) continue;
    scheduled[slot.kind] = await sendOpenTaskReminder({
      kind: slot.kind,
      headline: slot.title,
      now,
      byUser,
      userIds,
      dropTokens,
    });
  }

  const dead = [...dropTokens].filter(Boolean);
  if (dead.length > 0) {
    await db.delete(pushTokensTable).where(inArray(pushTokensTable.token, dead));
  }

  const scheduledTotal = Object.values(scheduled).reduce((sum, n) => sum + n, 0);
  if (uniqueReminded.length > 0 || scheduledTotal > 0) {
    logger.info({ snooze: uniqueReminded.length, scheduled }, "reminders sent");
  }

  return { snooze: uniqueReminded.length, scheduled };
}

async function sendOpenTaskReminder(input: {
  kind: ScheduledReminderKind;
  headline: string;
  now: Date;
  byUser: Map<string, string[]>;
  userIds: string[];
  dropTokens: Set<string>;
}): Promise<number> {
  const sentOn = localDateKey(input.now, TIME_ZONE);
  const already = await db
    .select({ userId: pushRemindersTable.userId })
    .from(pushRemindersTable)
    .where(
      and(
        eq(pushRemindersTable.kind, input.kind),
        eq(pushRemindersTable.sentOn, sentOn),
        inArray(pushRemindersTable.userId, input.userIds),
      ),
    );
  const sentUsers = new Set(already.map((row) => row.userId));

  const open = await db
    .select({
      userId: actionsTable.userId,
      title: actionsTable.title,
    })
    .from(actionsTable)
    .where(
      and(
        inArray(actionsTable.userId, input.userIds),
        inArray(actionsTable.status, [...OPEN_STATUSES]),
        or(isNull(actionsTable.snoozedUntil), lte(actionsTable.snoozedUntil, input.now)),
      ),
    );

  const titlesByUser = new Map<string, string[]>();
  for (const action of open) {
    const list = titlesByUser.get(action.userId) ?? [];
    list.push(action.title);
    titlesByUser.set(action.userId, list);
  }

  let sent = 0;
  for (const [userId, titles] of titlesByUser) {
    if (sentUsers.has(userId)) continue;
    const note = openTasksReminder(titles, input.headline);
    if (!note) continue;
    const destinations = input.byUser.get(userId) ?? [];
    const messages = destinations.map((token) => ({
      to: token,
      title: note.title,
      body: note.body,
      sound: "default" as const,
      channelId: "reminders",
    }));
    const results = await sendExpoPush(messages);
    results.forEach((result, index) => {
      if (result.drop) input.dropTokens.add(messages[index]?.to ?? "");
    });
    if (results.some((result) => result.ok)) {
      await db
        .insert(pushRemindersTable)
        .values({ userId, kind: input.kind, sentOn })
        .onConflictDoNothing();
      sent += 1;
    }
  }
  return sent;
}

async function sendExpoPush(messages: PushMessage[]): Promise<Array<{ ok: boolean; drop: boolean }>> {
  if (messages.length === 0) return [];
  const results: Array<{ ok: boolean; drop: boolean }> = [];

  for (let offset = 0; offset < messages.length; offset += 80) {
    const batch = messages.slice(offset, offset + 80);
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Accept: "application/json",
      };
      const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(batch),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, "expo push rejected the batch");
        results.push(...batch.map(() => ({ ok: false, drop: false })));
        continue;
      }
      const json = (await res.json()) as { data?: ExpoTicket[] };
      const tickets = json.data ?? [];
      for (let index = 0; index < batch.length; index += 1) {
        const ticket = tickets[index];
        const error = ticket?.details?.error;
        results.push({
          ok: ticket?.status === "ok",
          drop: error === "DeviceNotRegistered",
        });
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : "unknown" }, "expo push request failed");
      results.push(...batch.map(() => ({ ok: false, drop: false })));
    }
  }

  return results;
}
