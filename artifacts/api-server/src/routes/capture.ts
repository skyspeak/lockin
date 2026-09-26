import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db, thoughtsTable, actionsTable } from "@workspace/db";
import {
  transcribeAudio,
  extractFromThought,
  fulfillExtractResult,
  prepareTranscript,
  presentCaptureError,
} from "@workspace/integrations";
import { seedFollowUpPlanFromExtract } from "../services/followUpPlan";
import { createCalendarEvents, sendGmail } from "../lib/google";
import {
  audioLimiter,
  audioUpload,
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

async function persistFromTranscript(
  req: Request,
  res: Response,
  transcript: string,
  mode: "tasks" | "transcribe",
): Promise<Response> {
  const userId = req.userId;

  if (mode === "transcribe") {
      const [thought] = await db
        .insert(thoughtsTable)
        .values({
          userId,
          content: transcript,
          category: "other",
        })
        .returning();

      const title = transcript.trim().slice(0, 500) || "Note";
      const [action] = await db
        .insert(actionsTable)
        .values({
          userId,
          title,
          description: transcript.trim().slice(0, 2000),
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

    const extractCtx = {
      userEmail: process.env.LOCKIN_USER_EMAIL || process.env.DIGEST_EMAIL || undefined,
      userName: process.env.LOCKIN_USER_NAME || undefined,
      contactsJson: process.env.LOCKIN_CONTACTS_JSON || undefined,
      timeZone: process.env.LOCKIN_TIMEZONE || "America/Los_Angeles",
    };

    const routed = await extractFromThought(transcript, new Date(), extractCtx);
    if (routed.actions.length === 0) {
      return res.status(400).json({ error: "Nothing captured. Try speaking again." });
    }

    // Commit the pile first. Fulfill (research / email / solve maps) can be
    // slow or die on the proxy — that must not drop the tasks.
    const [thought] = await db
      .insert(thoughtsTable)
      .values({
        userId,
        content: transcript,
        category: "other",
      })
      .returning();

    let inserted = await db
      .insert(actionsTable)
      .values(
        routed.actions.map((item) => ({
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

    let extracted = routed;
    try {
      extracted = await fulfillExtractResult(routed, extractCtx);
      inserted = await Promise.all(
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
      inserted.map(async (action, index) => {
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

    let calendarError: string | undefined;
    let calendarCreated = 0;
    if (extracted.events.length > 0) {
      try {
        const result = await createCalendarEvents(extracted.events);
        calendarCreated = result.created;
        calendarError = result.error;
      } catch (err) {
        calendarError = err instanceof Error ? err.message : "Calendar failed";
        req.log.warn({ err: calendarError }, "calendar after capture failed");
      }
    }

    const emails: Array<{
      title: string;
      subject: string;
      to: string[];
      sent: boolean;
      error?: string;
    }> = [];

    for (const item of extracted.actions) {
      const email = item.fulfillment?.email;
      if (!email) continue;
      if (!email.sendNow || email.to.length === 0) {
        emails.push({
          title: item.title,
          subject: email.subject,
          to: email.to,
          sent: false,
          error:
            email.missing.length > 0
              ? `Need: ${email.missing.join(", ")}`
              : "Recipient email missing — draft saved in the plan",
        });
        continue;
      }
      try {
        const sent = await sendGmail(email.to, email.subject, email.body);
        emails.push({
          title: item.title,
          subject: email.subject,
          to: email.to,
          sent,
          error: sent ? undefined : "Gmail is not connected",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Email send failed";
        req.log.warn({ err: message, title: item.title }, "intro/email send failed");
        emails.push({
          title: item.title,
          subject: email.subject,
          to: email.to,
          sent: false,
          error: message,
        });
      }
    }

    const research = extracted.actions
      .filter((item) => item.routerType === "research_now" || item.routerType === "research_topic")
      .map((item) => ({
        title: item.title,
        type: item.routerType,
        answer: item.fulfillment?.researchAnswer || item.fulfillment?.summary || item.description || "",
      }));

    return res.json({
      transcript,
      actions: inserted,
      events: extracted.events,
      calendarCreated,
      calendarError,
      emails,
      research,
      kinds: extracted.actions.map((item) => item.routerType ?? "task"),
    });
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

    if (!req.file) {
      return res.status(400).json({ error: "Type a note or attach audio." });
    }

    if (req.file.buffer.length < 8) {
      return res.status(400).json({ error: "Recording too short. Hold the mic and speak a bit longer." });
    }

    const sniffed = sniffAudioMime(req.file.buffer);
    const claimed = (req.file.mimetype || "").toLowerCase();
    if (!sniffed) {
      req.log.warn({ claimed, bytes: req.file.buffer.length }, "capture rejected unknown audio");
      return res.status(415).json({ error: "Unsupported audio type" });
    }

    const transcript = await transcribeAudio({
      buffer: req.file.buffer,
      mime: sniffed,
      filename: safeAudioFilename(req.file.originalname),
    });

    if (!transcript.trim()) {
      return res.status(400).json({ error: "Nothing captured. Try speaking again." });
    }

    return await persistFromTranscript(req, res, transcript, mode);
  } catch (err) {
    req.log.error(
      { err: err instanceof Error ? err.message : "unknown" },
      "capture failed",
    );
    return res.status(500).json({ error: publicCaptureError(err) });
  }
});

export default router;
