import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, thoughtsTable, actionsTable } from "@workspace/db";
import {
  transcribeAudio,
  extractFromThought,
  fulfillExtractResult,
  prepareTranscript,
  presentCaptureError,
  type ExtractContext,
  type ExtractResult,
} from "@workspace/integrations";
import { seedFollowUpPlanFromExtract } from "../services/followUpPlan";
import { createCalendarEvents, sendGmail } from "../lib/google";
import {
  audioLimiter,
  audioUpload,
  MAX_AUDIO_BYTES,
  safeAudioFilename,
  sniffAudioMime,
} from "../lib/audioUpload";

const router = Router();
router.use(audioLimiter);

const MAX_TYPED_CHARS = 4000;

function publicCaptureError(err: unknown): string {
  const raw = err instanceof Error ? err.message : "Capture failed";
  return presentCaptureError(raw);
}

function captureMode(req: { query?: Record<string, unknown>; body?: Record<string, unknown> }): "tasks" | "transcribe" {
  const raw = String(req.query?.mode ?? req.body?.mode ?? "tasks").toLowerCase();
  return raw === "transcribe" ? "transcribe" : "tasks";
}

function typedText(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const text = (body as { text?: unknown }).text;
  return typeof text === "string" ? text.trim() : "";
}

/** JSON body audio from iOS (avoids flaky multipart FormData). */
function audioFromJsonBody(body: unknown): { buffer: Buffer; mime: string; filename: string } | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { audioBase64?: unknown; mime?: unknown; filename?: unknown }).audioBase64;
  if (typeof raw !== "string" || !raw.trim()) return null;
  const cleaned = raw.replace(/^data:[^;]+;base64,/i, "").replace(/\s+/g, "");
  let buffer: Buffer;
  try {
    buffer = Buffer.from(cleaned, "base64");
  } catch {
    return null;
  }
  if (buffer.length < 8 || buffer.length > MAX_AUDIO_BYTES) return null;
  const claimed = String((body as { mime?: unknown }).mime ?? "audio/mp4").toLowerCase();
  const filename = safeAudioFilename(
    typeof (body as { filename?: unknown }).filename === "string"
      ? ((body as { filename: string }).filename)
      : "audio.m4a",
  );
  return { buffer, mime: claimed, filename };
}

async function enrichCaptureInBackground(
  req: Request,
  inserted: Array<typeof actionsTable.$inferSelect>,
  routed: ExtractResult,
  extractCtx: ExtractContext,
): Promise<void> {
  let extracted = routed;
  let rows = inserted;
  try {
    extracted = await fulfillExtractResult(routed, extractCtx);
    rows = await Promise.all(
      inserted.map(async (action, index) => {
        const item = extracted.actions[index];
        if (!item) return action;
        const [updated] = await db
          .update(actionsTable)
          .set({
            title: item.title,
            description: item.description ?? null,
            category: item.category,
            priority: item.priority,
            nextSteps: item.nextSteps,
            updatedAt: new Date(),
          })
          .where(eq(actionsTable.id, action.id))
          .returning();
        return updated ?? action;
      }),
    );
  } catch (err) {
    req.log.warn(
      { err: err instanceof Error ? err.message : "unknown" },
      "fulfill after capture failed; pile already has the tasks",
    );
  }

  await Promise.all(
    rows.map(async (action, index) => {
      const item = extracted.actions[index];
      if (!item) return;
      try {
        await seedFollowUpPlanFromExtract(action, item);
      } catch (err) {
        req.log.warn(
          { actionId: action.id, err: err instanceof Error ? err.message : "unknown" },
          "follow-up seed after capture failed",
        );
      }
    }),
  );

  if (extracted.events.length > 0) {
    try {
      await createCalendarEvents(extracted.events);
    } catch (err) {
      req.log.warn(
        { err: err instanceof Error ? err.message : "Calendar failed" },
        "calendar after capture failed",
      );
    }
  }

  for (const item of extracted.actions) {
    const email = item.fulfillment?.email;
    if (!email?.sendNow || email.to.length === 0) continue;
    try {
      await sendGmail(email.to, email.subject, email.body);
    } catch (err) {
      req.log.warn(
        { err: err instanceof Error ? err.message : "Email send failed", title: item.title },
        "intro/email send failed",
      );
    }
  }
}

async function routeAndEnrichInBackground(
  req: Request,
  provisional: typeof actionsTable.$inferSelect,
  thoughtId: number,
  transcript: string,
  extractCtx: ExtractContext,
): Promise<void> {
  const userId = req.userId;
  let routed: ExtractResult;
  try {
    routed = await extractFromThought(transcript, new Date(), extractCtx);
  } catch (err) {
    req.log.warn(
      { err: err instanceof Error ? err.message : "unknown" },
      "extract after capture failed; keeping provisional task",
    );
    return;
  }

  if (routed.actions.length === 0) return;

  const first = routed.actions[0]!;
  const [updatedFirst] = await db
    .update(actionsTable)
    .set({
      title: first.title,
      description: first.description ?? null,
      category: first.category,
      priority: first.priority,
      nextSteps: first.nextSteps,
      updatedAt: new Date(),
    })
    .where(eq(actionsTable.id, provisional.id))
    .returning();

  let rows = [updatedFirst ?? provisional];
  if (routed.actions.length > 1) {
    const extras = await db
      .insert(actionsTable)
      .values(
        routed.actions.slice(1).map((item: (typeof routed.actions)[number]) => ({
          userId,
          title: item.title,
          description: item.description ?? null,
          category: item.category,
          priority: item.priority,
          thoughtId,
          nextSteps: item.nextSteps,
        })),
      )
      .returning();
    rows = [...rows, ...extras];
  }

  await enrichCaptureInBackground(req, rows, routed, extractCtx);
}

async function persistFromTranscript(
  req: Request,
  res: Response,
  transcript: string,
  mode: "tasks" | "transcribe",
): Promise<Response> {
  const userId = req.userId;
  const trimmed = transcript.trim();

  if (mode === "transcribe") {
    const [thought] = await db
      .insert(thoughtsTable)
      .values({
        userId,
        content: transcript,
        category: "other",
      })
      .returning();

    const title = trimmed.slice(0, 500) || "Note";
    const [action] = await db
      .insert(actionsTable)
      .values({
        userId,
        title,
        description: trimmed.slice(0, 2000),
        category: "other",
        priority: "medium",
        thoughtId: thought.id,
        nextSteps: ["Captured as a note"],
      })
      .returning();

    return res.json({
      transcript,
      actions: [action],
      events: [],
      kinds: ["note"],
    });
  }

  const extractCtx: ExtractContext = {
    userEmail: process.env.LOCKIN_USER_EMAIL || process.env.DIGEST_EMAIL || undefined,
    userName: process.env.LOCKIN_USER_NAME || undefined,
    contactsJson: process.env.LOCKIN_CONTACTS_JSON || undefined,
    timeZone: process.env.LOCKIN_TIMEZONE || "America/Los_Angeles",
  };

  // Answer the phone immediately with a provisional row. LLM extract + fulfill
  // used to hold the socket open for 6–25s; the pile gets refined in background.
  const title = trimmed.slice(0, 120) || "New task";
  const [thought] = await db
    .insert(thoughtsTable)
    .values({
      userId,
      content: transcript,
      category: "other",
    })
    .returning();

  const [provisional] = await db
    .insert(actionsTable)
    .values({
      userId,
      title,
      description: trimmed.length > title.length ? trimmed.slice(0, 2000) : null,
      category: "other",
      priority: "medium",
      thoughtId: thought.id,
      nextSteps: ["Locking in…"],
    })
    .returning();

  res.json({
    transcript,
    actions: [provisional],
    events: [],
    calendarCreated: 0,
    emails: [] as Array<{ title: string; subject: string; to: string[]; sent: boolean; error?: string }>,
    research: [] as Array<{ title: string; type?: string; answer: string }>,
    kinds: ["task"],
    enriching: true,
  });

  void routeAndEnrichInBackground(req, provisional, thought.id, transcript, extractCtx).catch((err) => {
    req.log.warn(
      { err: err instanceof Error ? err.message : "unknown" },
      "background route/enrich after capture failed",
    );
  });

  return res;
}

async function captureFromAudioBuffer(
  req: Request,
  res: Response,
  buffer: Buffer,
  claimedMime: string,
  filename: string,
  mode: "tasks" | "transcribe",
): Promise<Response> {
  if (buffer.length < 8) {
    return res.status(400).json({ error: "Recording too short. Hold the mic and speak a bit longer." });
  }

  const sniffed = sniffAudioMime(buffer);
  if (!sniffed) {
    req.log.warn({ claimed: claimedMime, bytes: buffer.length }, "capture rejected unknown audio");
    return res.status(415).json({ error: "Unsupported audio type" });
  }

  const transcript = await transcribeAudio({
    buffer,
    mime: sniffed,
    filename,
  });

  if (!transcript.trim()) {
    return res.status(400).json({ error: "Nothing captured. Try speaking again." });
  }

  return persistFromTranscript(req, res, transcript, mode);
}

router.post("/", audioUpload.single("audio"), async (req, res) => {
  const mode = captureMode(req);
  const typed = typedText(req.body);

  try {
    if (typed) {
      if (typed.length > MAX_TYPED_CHARS) {
        return res.status(400).json({ error: "Note is too long (4000 character max)." });
      }
      const transcript = prepareTranscript(typed, { fromSpeech: false });
      if (!transcript) {
        return res.status(400).json({ error: "Nothing captured. Try speaking again." });
      }
      return await persistFromTranscript(req, res, transcript, mode);
    }

    const fromJson = audioFromJsonBody(req.body);
    if (fromJson) {
      return await captureFromAudioBuffer(
        req,
        res,
        fromJson.buffer,
        fromJson.mime,
        fromJson.filename,
        mode,
      );
    }

    if (!req.file) {
      return res.status(400).json({ error: "Type a note or attach audio." });
    }

    return await captureFromAudioBuffer(
      req,
      res,
      req.file.buffer,
      req.file.mimetype || "",
      safeAudioFilename(req.file.originalname),
      mode,
    );
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "capture failed",
    );
    if (res.headersSent) return res;
    return res.status(500).json({ error: publicCaptureError(err) });
  }
});

export default router;
