import assert from "node:assert/strict";
import test from "node:test";
import {
  inMorningReminderWindow,
  inScheduledReminderWindow,
  isExpoPushToken,
  localDateKey,
  morningReminder,
  openTasksReminder,
  SCHEDULED_REMINDERS,
  shouldRemindSnooze,
  snoozeReminder,
} from "./src/lib/reminderPlan.ts";

test("accepts expo push tokens only", () => {
  assert.equal(isExpoPushToken("ExponentPushToken[abc123]"), true);
  assert.equal(isExpoPushToken("ExpoPushToken[abc123]"), true);
  assert.equal(isExpoPushToken("not-a-token"), false);
  assert.equal(isExpoPushToken(""), false);
});

test("reminds a snooze once, then again after it is snoozed further", () => {
  const now = new Date("2026-09-26T18:00:00.000Z");
  const due = new Date("2026-09-26T17:00:00.000Z");
  const later = new Date("2026-09-27T17:00:00.000Z");
  assert.equal(shouldRemindSnooze(due, null, now), true);
  assert.equal(shouldRemindSnooze(due, due, now), false);
  assert.equal(shouldRemindSnooze(later, due, now), false);
  assert.equal(shouldRemindSnooze(due, new Date("2026-09-20T17:00:00.000Z"), now), true);
});

test("morning window is 8am to 10am Pacific", () => {
  const eight = new Date("2026-09-26T15:00:00.000Z");
  const seven = new Date("2026-09-26T14:30:00.000Z");
  const ten = new Date("2026-09-26T17:00:00.000Z");
  assert.equal(inMorningReminderWindow(eight), true);
  assert.equal(inMorningReminderWindow(seven), false);
  assert.equal(inMorningReminderWindow(ten), false);
  assert.equal(localDateKey(eight, "America/Los_Angeles"), "2026-09-26");
});

test("scheduled slots are 1pm and 5pm Pacific", () => {
  assert.deepEqual(
    SCHEDULED_REMINDERS.map((slot) => slot.hour),
    [13, 17],
  );
  // 2026-09-26 13:00 PDT = 20:00 UTC
  const onePm = new Date("2026-09-26T20:00:00.000Z");
  const noon = new Date("2026-09-26T19:00:00.000Z");
  // 2026-09-26 17:00 PDT = 00:00 UTC next day
  const fivePm = new Date("2026-09-27T00:00:00.000Z");
  assert.equal(inScheduledReminderWindow(13, onePm), true);
  assert.equal(inScheduledReminderWindow(13, noon), false);
  assert.equal(inScheduledReminderWindow(17, fivePm), true);
  assert.equal(inScheduledReminderWindow(17, onePm), false);
});

test("reminder copy stays short", () => {
  assert.equal(snoozeReminder("Email Sam").title, "Back on your list");
  assert.equal(snoozeReminder("Email Sam").body, "Email Sam");
  assert.equal(morningReminder([]), null);
  assert.equal(morningReminder(["Buy milk"])?.body, "Buy milk");
  assert.equal(morningReminder(["Buy milk", "Call Priya", "Book flight"])?.body, "Buy milk and 2 more");
  assert.equal(openTasksReminder(["Buy milk"], "Lock In check-in")?.title, "Lock In check-in");
});
