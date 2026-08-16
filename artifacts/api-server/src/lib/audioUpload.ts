import multer from "multer";
import rateLimit from "express-rate-limit";
import type { Request } from "express";

export const ALLOWED_AUDIO_MIME = new Set([
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

const ALLOWED_EXT = new Set(["webm", "ogg", "oga", "mp4", "m4a", "mp3", "wav", "mpeg"]);

export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export function safeAudioFilename(originalname: string | undefined): string {
  const base = (originalname ?? "audio.webm").split(/[/\\]/).pop() ?? "audio.webm";
  const ext = base.split(".").pop()?.toLowerCase() ?? "webm";
  const safeExt = ALLOWED_EXT.has(ext) ? ext : "webm";
  return `audio.${safeExt}`;
}

export function sniffAudioMime(buffer: Buffer): string | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "audio/webm";
  }
  if (buffer.toString("ascii", 0, 4) === "OggS") return "audio/ogg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE") {
    return "audio/wav";
  }
  if (buffer.toString("ascii", 4, 8) === "ftyp") return "audio/mp4";
  if (buffer.toString("ascii", 0, 3) === "ID3") return "audio/mpeg";
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg";
  return null;
}

export const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype || "").toLowerCase();
    if (mime && !ALLOWED_AUDIO_MIME.has(mime)) {
      cb(new Error("Unsupported audio type"));
      return;
    }
    cb(null, true);
  },
});

export const audioLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many capture requests, please slow down." },
  keyGenerator: (req: Request) => req.userId || req.ip || "anonymous",
});
