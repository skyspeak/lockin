import type { Action } from "@workspace/db";
import { db, followUpPlansTable } from "@workspace/db";
import {
  generateFollowUpPlan,
  isFollowUpPlansEnabled,
  type ExtractedAction,
} from "@workspace/integrations";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

export function enqueueFollowUpPlan(action: Action): void {
  if (!isFollowUpPlansEnabled()) return;

  void runFollowUpPlan(action).catch((err) => {
    logger.error({ actionId: action.id, err: err instanceof Error ? err.message : "unknown" }, "follow-up plan pipeline failed");
  });
}

export async function seedFollowUpPlanFromExtract(
  action: Action,
  extracted: ExtractedAction,
): Promise<void> {
  const steps =
    extracted.nextSteps.length > 0
      ? extracted.nextSteps
      : ["Start the first 15 minutes", "Mark this done when finished"];

  await db.insert(followUpPlansTable).values({
    actionId: action.id,
    userId: action.userId,
    status: "ready",
    summary: extracted.description?.trim() || action.title,
    steps,
    userTodos: steps.slice(0, 4).map((text, index) => ({
      id: `todo-${index + 1}`,
      text,
      done: false,
    })),
    checkInHint: extracted.checkInHint ?? null,
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
    logger.error(
      { actionId: action.id, err: err instanceof Error ? err.message : "unknown" },
      "follow-up generation failed",
    );
    await db
      .update(followUpPlansTable)
      .set({
        status: "failed",
        errorMessage: "Generation failed",
        updatedAt: new Date(),
      })
      .where(eq(followUpPlansTable.id, plan.id));
  }
}
