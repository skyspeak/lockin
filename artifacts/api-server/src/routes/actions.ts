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

  const conditions = [];
  if (status) conditions.push(eq(actionsTable.status, status));
  if (!includeSnoozed) {
    conditions.push(
      or(isNull(actionsTable.snoozedUntil), lte(actionsTable.snoozedUntil, new Date())),
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;

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

  const [action] = await db
    .insert(actionsTable)
    .values(parsed.data)
    .returning();

  return res.status(201).json(action);
});

router.get("/queue", async (_req, res) => {
  const queue = await db
    .select()
    .from(actionsTable)
    .where(
      and(
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
        sql`status IN ('pending', 'in-progress')`,
        sql`snoozed_until > NOW()`,
      ),
    );

  const [{ doneCount }] = await db
    .select({ doneCount: sql<number>`count(*)::int` })
    .from(actionsTable)
    .where(eq(actionsTable.status, "done"));

  return res.json({ queue, snoozedCount, doneCount });
});

router.put("/:id", async (req, res) => {
  const paramParsed = UpdateActionParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) return res.status(400).json({ error: "Invalid id" });

  const bodyParsed = UpdateActionBody.safeParse(req.body);
  if (!bodyParsed.success) return res.status(400).json({ error: "Invalid body" });

  const updates: Record<string, unknown> = { ...bodyParsed.data, updatedAt: new Date() };
  if (bodyParsed.data.status === "done" || bodyParsed.data.status === "dismissed") {
    updates.completedAt = new Date();
  }

  const [action] = await db
    .update(actionsTable)
    .set(updates)
    .where(eq(actionsTable.id, paramParsed.data.id))
    .returning();

  if (!action) return res.status(404).json({ error: "Action not found" });
  return res.json(action);
});

router.post("/:id/snooze", async (req, res) => {
  const paramParsed = SnoozeActionParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) return res.status(400).json({ error: "Invalid id" });

  const bodyParsed = SnoozeActionBody.safeParse(req.body ?? {});
  if (!bodyParsed.success) return res.status(400).json({ error: "Invalid body" });

  const days = bodyParsed.data.days ?? 7;
  const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const [action] = await db
    .update(actionsTable)
    .set({ snoozedUntil, status: "pending", updatedAt: new Date() })
    .where(eq(actionsTable.id, paramParsed.data.id))
    .returning();

  if (!action) return res.status(404).json({ error: "Action not found" });
  return res.json(action);
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteActionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) return res.status(400).json({ error: "Invalid id" });

  await db.delete(actionsTable).where(eq(actionsTable.id, parsed.data.id));
  return res.status(204).send();
});

export default router;
