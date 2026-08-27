import type { Action } from "@workspace/db";
import { db, followUpPlansTable, actionsTable } from "@workspace/db";
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
  const fulfillment = extracted.fulfillment;
  const steps =
    fulfillment?.steps?.length
      ? fulfillment.steps
      : extracted.nextSteps.length > 0
        ? extracted.nextSteps
        : ["Start the first 15 minutes", "Mark this done when finished"];

  const todos = (
    fulfillment?.userTodos?.length
      ? fulfillment.userTodos
      : steps.slice(0, 4)
  ).map((text, index) => ({
    id: `todo-${index + 1}`,
    text: text.slice(0, 300),
    done: false,
  }));

  const summary =
    fulfillment?.researchAnswer?.trim() ||
    fulfillment?.summary?.trim() ||
    extracted.description?.trim() ||
    action.title;

  await db.insert(followUpPlansTable).values({
    actionId: action.id,
    userId: action.userId,
    status: "ready",
    summary: summary.slice(0, 4000),
    steps: steps.slice(0, 12),
    userTodos: todos.slice(0, 8),
    checkInHint: fulfillment?.checkInHint ?? extracted.checkInHint ?? null,
  });

  // Keep the action row in sync with the deeper map / research answer.
  if (fulfillment) {
    await db
      .update(actionsTable)
      .set({
        description: summary.slice(0, 4000),
        nextSteps: steps.slice(0, 8),
        updatedAt: new Date(),
      })
      .where(eq(actionsTable.id, action.id));
  }
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
