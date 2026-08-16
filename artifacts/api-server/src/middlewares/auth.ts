import type { Request, Response, NextFunction } from "express";
import { createHash, timingSafeEqual } from "crypto";
import { verifyAccessToken } from "../lib/tokens";

const rawSecret = process.env.API_SECRET;

if (!rawSecret || rawSecret.length < 32) {
  throw new Error("API_SECRET must be set and at least 32 characters.");
}

const API_SECRET = rawSecret;

export const DERIVED_USER_ID = createHash("sha256").update(API_SECRET).digest("hex");

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

function secretsEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);

  if (secretsEqual(token, API_SECRET)) {
    req.userId = DERIVED_USER_ID;
    next();
    return;
  }

  const userId = await verifyAccessToken(token);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.userId = userId;
  next();
}
