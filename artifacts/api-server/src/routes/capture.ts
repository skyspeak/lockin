import { Router } from "express";
import { db, thoughtsTable, actionsTable } from "@workspace/db";
import { transcribeAudio, extractActionsFromThought } from "@workspace/integrations";
import { CaptureThoughtResponse } from "@workspace/api-zod";
import { seedFollowUpPlanFromExtract } from "../services/followUpPlan";
import {
  ALLOWED_AUDIO_MIME,
  audioLimiter,
  audioUpload,
  safeAudioFilename,
  sniffAudioMime,
} from "../lib/audioUpload";

const router = Router();
router.use(audioLimiter);

router.post("/", audioUpload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing audio file (field name: 'audio')" });
  }

  const sniffed = sniffAudioMime(req.file.buffer);
  const claimed = (req.file.mimetype || "").toLowerCase();
  if (!sniffed) {
    return res.status(415).json({ error: "Unsupported audio type" });
  }
  if (claimed && !ALLOWED_AUDIO_MIME.has(claimed)) {
    return res.status(415).json({ error: `Unsupported audio type: ${req.file.mimetype}` });
  }

  const filename = safeAudioFilename(req.file.originalname);
  const mime = sniffed;
  const userId = req.userId;

  try {
    const transcript = await transcribeAudio({
      buffer: req.file.buffer,
      mime,
      filename,
    });

    if (!transcript.trim()) {
      return res.status(400).json({ error: "Nothing captured. Try speaking again." });
    }

    const extracted = await extractActionsFromThought(transcript);
    if (extracted.length === 0) {
      return res.status(400).json({ error: "Nothing captured. Try speaking again." });
    }

    const [thought] = await db
      .insert(thoughtsTable)
      .values({
        userId,
        content: transcript,
        category: "other",
      })
      .returning();

    const inserted = await db
      .insert(actionsTable)
      .values(
        extracted.map((item) => ({
          userId,
          title: item.title,
          description: item.description ?? null,
          category: item.category,
          priority: item.priority,
          thoughtId: thought.id,
          nextSteps: item.nextSteps,
        })),
      )
      .returning();

    await Promise.all(
      inserted.map((action, index) => {
        const item = extracted[index];
        if (!item) return Promise.resolve();
        return seedFollowUpPlanFromExtract(action, item);
      }),
    );

    const body = CaptureThoughtResponse.parse({
      transcript,
      actions: inserted,
    });
    return res.json(body);
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "capture failed",
    );
    return res.status(500).json({ error: "Capture failed" });
  }
});

export default router;
