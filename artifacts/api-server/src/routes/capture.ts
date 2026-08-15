import { Router } from "express";
import { db, thoughtsTable, actionsTable } from "@workspace/db";
import { transcribeAudio, extractActionsFromThought } from "@workspace/integrations";
import { CaptureThoughtResponse } from "@workspace/api-zod";
import { enqueueFollowUpPlan } from "../services/followUpPlan";
import { ALLOWED_AUDIO_MIME, audioLimiter, audioUpload } from "../lib/audioUpload";

const router = Router();
router.use(audioLimiter);

router.post("/", audioUpload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing audio file (field name: 'audio')" });
  }
  if (req.file.mimetype && !ALLOWED_AUDIO_MIME.has(req.file.mimetype.toLowerCase())) {
    return res.status(415).json({ error: `Unsupported audio type: ${req.file.mimetype}` });
  }

  const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "webm";
  const mime = req.file.mimetype || "audio/webm";
  const userId = req.userId;

  try {
    const transcript = await transcribeAudio({
      buffer: req.file.buffer,
      mime,
      filename: `audio.${ext}`,
    });

    if (!transcript.trim()) {
      return res.status(400).json({ error: "Nothing captured. Try speaking again." });
    }

    const extracted = await extractActionsFromThought(transcript);

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
        })),
      )
      .returning();

    for (const action of inserted) {
      enqueueFollowUpPlan(action);
    }

    const body = CaptureThoughtResponse.parse({
      transcript,
      actions: inserted,
    });
    return res.json(body);
  } catch (err) {
    req.log.error({ err }, "capture failed");
    return res.status(500).json({ error: "Capture failed" });
  }
});

export default router;
