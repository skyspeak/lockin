import { Router } from "express";
import { db, followUpPlansTable, actionsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import {
  ListFollowUpPlansQueryParams,
  GetFollowUpPlanParams,
  ToggleFollowUpTodoParams,
  ToggleFollowUpTodoBody,
} from "@workspace/api-zod";

const router = Router();

function serializePlan(
  plan: typeof followUpPlansTable.$inferSelect,
  actionTitle: string,
) {
  return {
    id: plan.id,
    actionId: plan.actionId,
    actionTitle,
    userId: plan.userId,
    status: plan.status,
    summary: plan.summary,
    steps: plan.steps,
    userTodos: plan.userTodos,
    checkInHint: plan.checkInHint,
    errorMessage: plan.errorMessage,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

router.get("/", async (req, res) => {
  const parsed = ListFollowUpPlansQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }
  const { limit, offset } = parsed.data;
  if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
    return res.status(400).json({ error: "Invalid query params" });
  }
  const userId = req.userId;

  const where = eq(followUpPlansTable.userId, userId);

  const rows = await db
    .select({
      plan: followUpPlansTable,
      actionTitle: actionsTable.title,
    })
    .from(followUpPlansTable)
    .innerJoin(actionsTable, eq(followUpPlansTable.actionId, actionsTable.id))
    .where(where)
    .orderBy(desc(followUpPlansTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(followUpPlansTable)
    .where(where);

  return res.json({
    plans: rows.map(({ plan, actionTitle }) => serializePlan(plan, actionTitle)),
    total: count,
  });
});

router.get("/:id", async (req, res) => {
  const rawId = Number(req.params.id);
  if (!Number.isInteger(rawId)) return res.status(400).json({ error: "Invalid id" });
  const paramParsed = GetFollowUpPlanParams.safeParse({ id: rawId });
  if (!paramParsed.success) return res.status(400).json({ error: "Invalid id" });

  const userId = req.userId;

  const [row] = await db
    .select({
      plan: followUpPlansTable,
      actionTitle: actionsTable.title,
    })
    .from(followUpPlansTable)
    .innerJoin(actionsTable, eq(followUpPlansTable.actionId, actionsTable.id))
    .where(
      and(
        eq(followUpPlansTable.id, paramParsed.data.id),
        eq(followUpPlansTable.userId, userId),
      ),
    );

  if (!row) return res.status(404).json({ error: "Follow-up plan not found" });
  return res.json(serializePlan(row.plan, row.actionTitle));
});

router.patch("/:id/todos/:todoId", async (req, res) => {
  const rawId = Number(req.params.id);
  if (!Number.isInteger(rawId)) return res.status(400).json({ error: "Invalid id" });
  const paramParsed = ToggleFollowUpTodoParams.safeParse({
    id: rawId,
    todoId: req.params.todoId,
  });
  if (!paramParsed.success) return res.status(400).json({ error: "Invalid params" });

  const bodyParsed = ToggleFollowUpTodoBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: "Invalid body" });

  const userId = req.userId;

  const [existing] = await db
    .select({
      plan: followUpPlansTable,
      actionTitle: actionsTable.title,
    })
    .from(followUpPlansTable)
    .innerJoin(actionsTable, eq(followUpPlansTable.actionId, actionsTable.id))
    .where(
      and(
        eq(followUpPlansTable.id, paramParsed.data.id),
        eq(followUpPlansTable.userId, userId),
      ),
    );

  if (!existing) return res.status(404).json({ error: "Follow-up plan not found" });

  const todoIndex = existing.plan.userTodos.findIndex(
    (todo) => todo.id === paramParsed.data.todoId,
  );
  if (todoIndex === -1) return res.status(404).json({ error: "Todo not found" });

  const userTodos = existing.plan.userTodos.map((todo, index) =>
    index === todoIndex ? { ...todo, done: bodyParsed.data.done } : todo,
  );

  const [updated] = await db
    .update(followUpPlansTable)
    .set({ userTodos, updatedAt: new Date() })
    .where(eq(followUpPlansTable.id, paramParsed.data.id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Follow-up plan not found" });
  return res.json(serializePlan(updated, existing.actionTitle));
});

export default router;
