import { Router } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  googleAuthUrl,
  googleConfigured,
  googleStatus,
  publicOrigin,
  saveGoogleTokens,
  verifyGoogleState,
} from "../lib/google";

const router = Router();

router.get("/status", requireAuth, async (_req, res) => {
  const status = await googleStatus();
  res.json(status);
});

router.get("/connect", requireAuth, async (_req, res) => {
  if (!googleConfigured()) {
    res.status(503).json({
      error: "Google is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on Railway.",
    });
    return;
  }
  res.json({ url: googleAuthUrl() });
});

router.get("/callback", async (req, res) => {
  const origin = publicOrigin();
  const error = typeof req.query.error === "string" ? req.query.error : "";
  if (error) {
    res.redirect(`${origin}/?gmail=denied`);
    return;
  }
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !verifyGoogleState(state)) {
    res.redirect(`${origin}/?gmail=invalid`);
    return;
  }
  try {
    await saveGoogleTokens(code);
    res.redirect(`${origin}/?gmail=connected`);
  } catch (err) {
    req.log?.error({ err: err instanceof Error ? err.message : "unknown" }, "google oauth callback failed");
    res.redirect(`${origin}/?gmail=failed`);
  }
});

export default router;
