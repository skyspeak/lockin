import { Router } from "express";
import OpenAI from "openai";
import multer from "multer";
import rateLimit from "express-rate-limit";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many transcription requests, please slow down." },
});
router.use(limiter);

const ALLOWED_MIME = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
]);

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

router.post("/", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Missing audio file (field name: 'audio')" });
  }
  if (req.file.mimetype && !ALLOWED_MIME.has(req.file.mimetype.toLowerCase())) {
    return res.status(415).json({ error: `Unsupported audio type: ${req.file.mimetype}` });
  }

  try {
    const ext = req.file.originalname.split(".").pop()?.toLowerCase() || "webm";
    const mime = req.file.mimetype || "audio/webm";

    const file = new File([new Uint8Array(req.file.buffer)], `audio.${ext}`, { type: mime });

    const result = await openai.audio.transcriptions.create({
      file,
      model: "gpt-4o-mini-transcribe",
      response_format: "json",
    });

    return res.json({ text: result.text });
  } catch (err) {
    req.log.error({ err }, "transcription failed");
    return res.status(500).json({ error: "Transcription failed" });
  }
});

export default router;
