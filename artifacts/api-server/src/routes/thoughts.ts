import { Router } from "express";
import { db } from "@workspace/db";
import { thoughtsTable } from "@workspace/db";
import { eq, desc, ilike, sql } from "drizzle-orm";
import {
  CreateThoughtBody,
  UpdateThoughtBody,
  ListThoughtsQueryParams,
  GetThoughtParams,
  UpdateThoughtParams,
  DeleteThoughtParams,
} from "@workspace/api-zod";

const router = Router();

router.get("/", async (req, res) => {
  const parsed = ListThoughtsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid query params" });
  }
  const { category, search, limit, offset } = parsed.data;

  let query = db.select().from(thoughtsTable).$dynamic();

  if (category) {
    query = query.where(eq(thoughtsTable.category, category));
  }
  if (search) {
    query = query.where(ilike(thoughtsTable.content, `%${search}%`));
  }

  const thoughts = await query.orderBy(desc(thoughtsTable.createdAt)).limit(limit).offset(offset);

  const countQuery = db.select({ count: sql<number>`count(*)::int` }).from(thoughtsTable);
  const [{ count }] = category
    ? await countQuery.where(eq(thoughtsTable.category, category))
    : await countQuery;

  return res.json({ thoughts, total: count });
});

router.post("/", async (req, res) => {
  const parsed = CreateThoughtBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const [thought] = await db
    .insert(thoughtsTable)
    .values(parsed.data)
    .returning();

  return res.status(201).json(thought);
});

router.get("/stats", async (req, res) => {
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(thoughtsTable);

  const byCategory = await db
    .select({
      category: thoughtsTable.category,
      count: sql<number>`count(*)::int`,
    })
    .from(thoughtsTable)
    .groupBy(thoughtsTable.category);

  const [{ recentCount }] = await db
    .select({ recentCount: sql<number>`count(*)::int` })
    .from(thoughtsTable)
    .where(sql`created_at >= now() - interval '24 hours'`);

  return res.json({ total, byCategory, recentCount });
});

router.get("/:id", async (req, res) => {
  const parsed = GetThoughtParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const [thought] = await db
    .select()
    .from(thoughtsTable)
    .where(eq(thoughtsTable.id, parsed.data.id));

  if (!thought) {
    return res.status(404).json({ error: "Thought not found" });
  }

  return res.json(thought);
});

router.put("/:id", async (req, res) => {
  const paramParsed = UpdateThoughtParams.safeParse({ id: Number(req.params.id) });
  if (!paramParsed.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  const bodyParsed = UpdateThoughtBody.safeParse(req.body);
  if (!bodyParsed.success) {
    return res.status(400).json({ error: "Invalid body" });
  }

  const [thought] = await db
    .update(thoughtsTable)
    .set({ ...bodyParsed.data, updatedAt: new Date() })
    .where(eq(thoughtsTable.id, paramParsed.data.id))
    .returning();

  if (!thought) {
    return res.status(404).json({ error: "Thought not found" });
  }

  return res.json(thought);
});

router.delete("/:id", async (req, res) => {
  const parsed = DeleteThoughtParams.safeParse({ id: Number(req.params.id) });
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid id" });
  }

  await db.delete(thoughtsTable).where(eq(thoughtsTable.id, parsed.data.id));

  return res.status(204).send();
});

export default router;
