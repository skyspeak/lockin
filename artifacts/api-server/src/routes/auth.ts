import { randomUUID } from "node:crypto";
import { Router } from "express";
import { eq } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import { z } from "zod";
import {
  db,
  usersTable,
  actionsTable,
  thoughtsTable,
  followUpPlansTable,
} from "@workspace/db";
import { requireAuth, DERIVED_USER_ID } from "../middlewares/auth";
import { signAccessToken } from "../lib/tokens";

const router = Router();

const credentialsSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(320)
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts. Please wait a few minutes." },
});

async function claimLegacyData(userId: string, email: string): Promise<void> {
  const claimEmail = process.env.CLAIM_LEGACY_EMAIL?.trim().toLowerCase();
  if (!claimEmail || claimEmail !== email) return;

  await db
    .update(actionsTable)
    .set({ userId })
    .where(eq(actionsTable.userId, DERIVED_USER_ID));
  await db
    .update(thoughtsTable)
    .set({ userId })
    .where(eq(thoughtsTable.userId, DERIVED_USER_ID));
  await db
    .update(followUpPlansTable)
    .set({ userId })
    .where(eq(followUpPlansTable.userId, DERIVED_USER_ID));
}

router.post("/signup", authLimiter, async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and a password of at least 8 characters." });
    return;
  }

  const { email, password } = parsed.data;
  const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ error: "An account with that email already exists." });
    return;
  }

  const id = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(usersTable).values({ id, email, passwordHash });
  await claimLegacyData(id, email);

  const token = await signAccessToken(id);
  res.status(201).json({ token, user: { id, email } });
});

router.post("/login", authLimiter, async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const token = await signAccessToken(user.id);
  res.json({ token, user: { id: user.id, email: user.email } });
});

router.get("/me", requireAuth, async (req, res) => {
  const [user] = await db
    .select({ id: usersTable.id, email: usersTable.email, createdAt: usersTable.createdAt })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId))
    .limit(1);

  if (!user) {
    res.json({ id: req.userId, email: null, legacy: true });
    return;
  }

  res.json({ id: user.id, email: user.email, legacy: false, createdAt: user.createdAt });
});

router.delete("/account", requireAuth, async (req, res) => {
  const userId = req.userId;
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(400).json({ error: "No account to delete." });
    return;
  }

  await db.delete(followUpPlansTable).where(eq(followUpPlansTable.userId, userId));
  await db.delete(actionsTable).where(eq(actionsTable.userId, userId));
  await db.delete(thoughtsTable).where(eq(thoughtsTable.userId, userId));
  await db.delete(usersTable).where(eq(usersTable.id, userId));
  res.status(204).end();
});

export default router;
