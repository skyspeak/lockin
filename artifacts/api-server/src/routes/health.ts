import { Router, type IRouter } from "express";
import { probeChatProviders, resolveGeminiConfig, resolveOpenRouterConfig } from "@workspace/integrations";

const router: IRouter = Router();

router.get("/healthz", async (req, res) => {
  const geminiCfg = resolveGeminiConfig();
  const openrouterCfg = resolveOpenRouterConfig();
  const probe = req.query.probe === "1" || req.query.probe === "true";

  const body: Record<string, unknown> = {
    status: "ok",
    gemini: Boolean(geminiCfg),
    openrouter: Boolean(openrouterCfg),
    model: geminiCfg?.model || openrouterCfg?.model || "none",
    fallbacks: {
      gemini: ["gemini-2.5-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash-lite", "gemini-3.5-flash"],
      openrouter: ["google/gemini-2.5-flash", "google/gemini-3.5-flash-lite", "openai/gpt-4o-mini"],
    },
  };

  if (probe) {
    try {
      body.providers = await probeChatProviders();
    } catch (err) {
      body.providers = {
        error: err instanceof Error ? err.message : "probe failed",
      };
    }
  }

  res.json(body);
});

export default router;
