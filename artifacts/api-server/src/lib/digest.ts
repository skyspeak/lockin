import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { db, actionsTable, usersTable } from "@workspace/db";
import { digestEmail, sendGmail } from "./google";
import { logger } from "./logger";

function formatDigest(actions: Array<{ title: string; category: string; nextSteps: string[] | null }>): string {
  const groups = new Map<string, typeof actions>();
  for (const action of actions) {
    const key = action.category || "other";
    const list = groups.get(key) ?? [];
    list.push(action);
    groups.set(key, list);
  }
  const lines = ["Your Lock In tasks for tonight:", ""];
  for (const [category, items] of groups) {
    lines.push(category.toUpperCase());
    for (const item of items) {
      lines.push(`- ${item.title}`);
      const steps = Array.isArray(item.nextSteps) ? item.nextSteps : [];
      for (const step of steps) {
        lines.push(`    • ${step}`);
      }
    }
    lines.push("");
  }
  lines.push("Open Lock In to swipe them done.");
  return lines.join("\n");
}

export async function runDailyDigest(): Promise<{ sent: boolean; count: number; reason?: string }> {
  const email = digestEmail();
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    logger.info({ email }, "digest skipped: no user for DIGEST_EMAIL");
    return { sent: false, count: 0, reason: `No account for ${email}. Sign up with that email.` };
  }

  const now = new Date();
  const actions = await db
    .select({
      title: actionsTable.title,
      category: actionsTable.category,
      nextSteps: actionsTable.nextSteps,
    })
    .from(actionsTable)
    .where(
      and(
        eq(actionsTable.userId, user.id),
        inArray(actionsTable.status, ["pending", "in-progress"]),
        or(isNull(actionsTable.snoozedUntil), lte(actionsTable.snoozedUntil, now)),
      ),
    );

  if (actions.length === 0) {
    logger.info({ email }, "digest skipped: no open tasks");
    return { sent: false, count: 0, reason: "No open tasks." };
  }

  const subject = `Lock In — ${actions.length} ${actions.length === 1 ? "task" : "tasks"} for tonight`;
  const sent = await sendGmail(email, subject, formatDigest(actions));
  if (!sent) {
    return { sent: false, count: actions.length, reason: "Gmail is not connected." };
  }
  logger.info({ email, count: actions.length }, "digest sent");
  return { sent: true, count: actions.length };
}
