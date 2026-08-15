import { Router } from "express";
import { transcribeAudio } from "@workspace/integrations";
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

  try {
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "webm";
    const mime = req.file.mimetype || "audio/webm";
    const text = await transcribeAudio({
      buffer: req.file.buffer,
      mime,
      filename: `audio.${ext}`,
    });
    return res.json({ text });
  } catch (err) {
    req.log.error({ err }, "transcription failed");
    return res.status(500).json({ error: "Transcription failed" });
  }
});

export default router;
