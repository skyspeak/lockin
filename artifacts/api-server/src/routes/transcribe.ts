import { Router } from "express";
import { transcribeAudio } from "@workspace/integrations";
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

  try {
    const text = await transcribeAudio({
      buffer: req.file.buffer,
      mime: sniffed,
      filename: safeAudioFilename(req.file.originalname),
    });
    return res.json({ text });
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "transcription failed",
    );
    return res.status(500).json({ error: "Transcription failed" });
  }
});

export default router;
