import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { runDailyDigest } from "../lib/digest";

const router = Router();

function cronAuthorized(header: string | undefined): boolean {
  const expected = process.env.CRON_SECRET || process.env.API_SECRET || "";
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

router.post("/digest", async (req, res) => {
  if (!cronAuthorized(req.headers.authorization)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const result = await runDailyDigest();
    res.json(result);
  } catch (err) {
    req.log?.error({ err: err instanceof Error ? err.message : "unknown" }, "digest failed");
    res.status(500).json({ error: "Digest failed" });
  }
});

export default router;
