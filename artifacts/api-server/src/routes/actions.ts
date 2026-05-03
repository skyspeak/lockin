import { Router } from "express";
import { db } from "@workspace/db";
import { actionsTable } from "@workspace/db";
import { eq, desc, and, or, isNull, lte, sql } from "drizzle-orm";
import {
  CreateActionBody,
  UpdateActionBody,
  ListActionsQueryParams,
  UpdateActionParams,
  DeleteActionParams,
  SnoozeActionParams,
  SnoozeActionBody,
} from "@workspace/api-zod";

const router = Router();

const PRIORITY_ORDER = sql`CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`;

router.get("/", async (req, res) => {
  const parsed = ListActionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }
  const { status, includeSnoozed, limit, offset } = parsed.data;
  if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
    return res.status(400).json({ error: "Invalid query params" });
  }
  const userId = req.userId;

  const conditions = [eq(actionsTable.userId, userId)];
  if (status) conditions.push(eq(actionsTable.status, status));
  if (!includeSnoozed) {
    conditions.push(
      or(isNull(actionsTable.snoozedUntil), lte(actionsTable.snoozedUntil, new Date()))!,
    );
  }

  const where = and(...conditions);

  const actions = await db
    .select()
    .from(actionsTable)
    .where(where)
    .orderBy(PRIORITY_ORDER, desc(actionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(actionsTable)
    .where(where);

  return res.json({ actions, total: count });
});

router.post("/", async (req, res) => {
  const parsed = CreateActionBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }
  const userId = req.userId;

  const [action] = await db
    .insert(actionsTable)
    .values({ ...parsed.data, userId })
    .returning();

  return res.status(201).json(action);
});

router.get("/queue", async (req, res) => {
  const userId = req.userId;

  const queue = await db
    .select()
    .from(actionsTable)
    .where(
      and(
        eq(actionsTable.userId, userId),
        sql`status IN ('pending', 'in-progress')`,
        or(isNull(actionsTable.snoozedUntil), lte(actionsTable.snoozedUntil, new Date())),
      ),
    )
    .orderBy(PRIORITY_ORDER, desc(actionsTable.createdAt));

  const [{ snoozedCount }] = await db
    .select({ snoozedCount: sql<number>`count(*)::int` })
    .from(actionsTable)
    .where(
      and(
        eq(actionsTable.userId, userId),
        sql`status IN ('pending', 'in-progress')`,
        sql`snoozed_until > NOW()`,
      ),
    );

  const [{ doneCount }] = await db
    .select({ doneCount: sql<number>`count(*)::int` })
    .from(actionsTable)
    .where(
      and(
        eq(actionsTable.userId, userId),
        eq(actionsTable.status, "done"),
      ),
    );

  return res.json({ queue, snoozedCount, doneCount });
});

router.put("/:id", async (req, res) => {
  const rawId = Number(req.params.id);
  if (!Number.isInteger(rawId)) return res.status(400).json({ error: "Invalid id" });
  const paramParsed = UpdateActionParams.safeParse({ id: rawId });
  if (!paramParsed.success) return res.status(400).json({ error: "Invalid id" });

  const bodyParsed = UpdateActionBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: "Invalid body" });

  const userId = req.userId;
  const updates: Record<string, unknown> = { ...bodyParsed.data, updatedAt: new Date() };
  if (bodyParsed.data.status === "done" || bodyParsed.data.status === "dismissed") {
    updates.completedAt = new Date();
  }

  const [action] = await db
    .update(actionsTable)
    .set(updates)
    .where(and(eq(actionsTable.id, paramParsed.data.id), eq(actionsTable.userId, userId)))
    .returning();

  if (!action) return res.status(404).json({ error: "Action not found" });
  return res.json(action);
});

router.post("/:id/snooze", async (req, res) => {
  const rawId = Number(req.params.id);
  if (!Number.isInteger(rawId)) return res.status(400).json({ error: "Invalid id" });
  const paramParsed = SnoozeActionParams.safeParse({ id: rawId });
  if (!paramParsed.success) return res.status(400).json({ error: "Invalid id" });

  const bodyParsed = SnoozeActionBody.safeParse(req.body ?? {});
  if (!bodyParsed.success) return res.status(400).json({ error: "Invalid body" });

  const userId = req.userId;
  const days = bodyParsed.data.days ?? 7;
  if (!Number.isInteger(days)) return res.status(400).json({ error: "Invalid body" });
  const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const [action] = await db
    .update(actionsTable)
    .set({ snoozedUntil, status: "pending", updatedAt: new Date() })
    .where(and(eq(actionsTable.id, paramParsed.data.id), eq(actionsTable.userId, userId)))
    .returning();

  if (!action) return res.status(404).json({ error: "Action not found" });
  return res.json(action);
});

router.delete("/:id", async (req, res) => {
  const rawId = Number(req.params.id);
  if (!Number.isInteger(rawId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = DeleteActionParams.safeParse({ id: rawId });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  const userId = req.userId;

  const [deleted] = await db
    .delete(actionsTable)
    .where(and(eq(actionsTable.id, parsed.data.id), eq(actionsTable.userId, userId)))
    .returning({ id: actionsTable.id });

  if (!deleted) return res.status(404).json({ error: "Action not found" });
  return res.status(204).send();
});

export default router;
