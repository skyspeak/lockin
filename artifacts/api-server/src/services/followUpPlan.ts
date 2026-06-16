import type { Action } from "@workspace/db";
import { db, followUpPlansTable } from "@workspace/db";
import { generateFollowUpPlan, isFollowUpPlansEnabled } from "@workspace/integrations";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export function enqueueFollowUpPlan(action: Action): void {
  if (!isFollowUpPlansEnabled()) return;

  void runFollowUpPlan(action).catch((err) => {
    logger.error({ err, actionId: action.id }, "follow-up plan pipeline failed");
  });
}

async function runFollowUpPlan(action: Action): Promise<void> {
  const [plan] = await db
    .insert(followUpPlansTable)
    .values({
      actionId: action.id,
      userId: action.userId,
      status: "generating",
    })
    .returning();

  try {
    const content = await generateFollowUpPlan(action.title);
    await db
      .update(followUpPlansTable)
      .set({
        status: "ready",
        summary: content.summary,
        steps: content.steps,
        userTodos: content.userTodos,
        checkInHint: content.checkInHint,
        updatedAt: new Date(),
      })
      .where(eq(followUpPlansTable.id, plan.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db
      .update(followUpPlansTable)
      .set({
        status: "failed",
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(followUpPlansTable.id, plan.id));
  }
}
