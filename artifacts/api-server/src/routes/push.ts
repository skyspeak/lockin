import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db, pushTokensTable } from "@workspace/db";
import { isExpoPushToken } from "../lib/reminderPlan";

const router = Router();

router.post("/register", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!isExpoPushToken(token)) {
    res.status(400).json({ error: "Invalid push token" });
    return;
  }
  const platform = req.body?.platform === "android" ? "android" : "ios";
  await db
    .insert(pushTokensTable)
    .values({ token, userId: req.userId, platform, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: pushTokensTable.token,
      set: { userId: req.userId, platform, updatedAt: new Date() },
    });
  res.json({ ok: true });
});

router.delete("/register", async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) {
    res.status(400).json({ error: "Invalid push token" });
    return;
  }
  await db.delete(pushTokensTable).where(and(eq(pushTokensTable.token, token), eq(pushTokensTable.userId, req.userId)));
  res.json({ ok: true });
});

export default router;
