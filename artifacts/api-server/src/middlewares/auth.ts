import type { Request, Response, NextFunction } from "express";
import { createHash } from "crypto";

const API_SECRET = process.env.API_SECRET;

if (!API_SECRET) {
  throw new Error("API_SECRET environment variable must be set.");
}

export const DERIVED_USER_ID = createHash("sha256").update(API_SECRET).digest("hex");

declare global {
  namespace Express {
    interface Request {
      userId: string;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7);

  if (token !== API_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.userId = DERIVED_USER_ID;
  next();
}
