import { Router } from "express";
import { db } from "@workspace/db";
import { actionsTable } from "@workspace/db";
import { eq, desc, asc, sql } from "drizzle-orm";
import {
  CreateActionBody,
  UpdateActionBody,
  ListActionsQueryParams,
  GetActionQueueQueryParams,
  GetActionParams,
  UpdateActionParams,
  DeleteActionParams,
} from "@workspace/api-zod";

const router = Router();

const PRIORITY_ORDER = sql`CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`;

router.get("/", async (req, res) => {
  const parsed = ListActionsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }
  const { category, status, limit, offset } = parsed.data;

  let baseQuery = db.select().from(actionsTable).$dynamic();

  if (category) {
    baseQuery = baseQuery.where(eq(actionsTable.category, category));
  }
  if (status) {
    baseQuery = baseQuery.where(eq(actionsTable.status, status));
  }

  const actions = await baseQuery
    .orderBy(PRIORITY_ORDER, desc(actionsTable.createdAt))
    .limit(limit)
    .offset(offset);

  const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(actionsTable);
  const [{ count }] = await countQuery;

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

router.get("/queue", async (req, res) => {
  const parsed = GetActionQueueQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }

  let baseQuery = db
    .select()
    .from(actionsTable)
    .where(sql`status IN ('pending', 'in-progress')`)
    .$dynamic();

  if (parsed.data.category) {
    baseQuery = baseQuery.where(eq(actionsTable.category, parsed.data.category));
  }

  const queue = await baseQuery.orderBy(
    asc(actionsTable.status),
    PRIORITY_ORDER,
    desc(actionsTable.createdAt),
  );

  return res.json({ queue, total: queue.length });
});

router.get("/summary", async (req, res) => {
  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
      inProgress: sql<number>`count(*) filter (where status = 'in-progress')::int`,
      done: sql<number>`count(*) filter (where status = 'done')::int`,
      dismissed: sql<number>`count(*) filter (where status = 'dismissed')::int`,
    })
    .from(actionsTable);

  const byCategory = await db
    .select({
      category: actionsTable.category,
      pending: sql<number>`count(*) filter (where status = 'pending')::int`,
      done: sql<number>`count(*) filter (where status = 'done')::int`,
    })
    .from(actionsTable)
    .groupBy(actionsTable.category);

  return res.json({ ...totals, byCategory });
});

router.get("/:id", async (req, res) => {
  const parsed = GetActionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const [action] = await db
    .select()
    .from(actionsTable)
    .where(eq(actionsTable.id, parsed.data.id));

  if (!action) {
    return res.status(404).json({ error: "Action not found" });
  }

  return res.json(action);
});

router.put("/:id", async (req, res) => {
  const paramParsed = UpdateActionParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const bodyParsed = UpdateActionBody.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const updates: Record<string, unknown> = { ...bodyParsed.data, updatedAt: new Date() };

  if (bodyParsed.data.status === "done" || bodyParsed.data.status === "dismissed") {
    updates.completedAt = new Date();
  }

  const [action] = await db
    .update(actionsTable)
    .set(updates)
    .where(eq(actionsTable.id, paramParsed.data.id))
    .returning();

  if (!action) {
    return res.status(404).json({ error: "Action not found" });
  }

  return res.json(action);
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteActionParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  await db.delete(actionsTable).where(eq(actionsTable.id, parsed.data.id));

  return res.status(204).send();
});

export default router;
