import { z } from "zod/v4";
import { chatCompletionJson } from "./llm";

export const LIFE_AREAS = [
  "work",
  "family",
  "hobbies",
  "extracurriculars",
  "other",
] as const;

export type LifeArea = (typeof LIFE_AREAS)[number];

const MAX_TRANSCRIPT_CHARS = 6000;

const extractedActionSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  category: z.enum(LIFE_AREAS),
  priority: z.enum(["low", "medium", "high"]),
  nextSteps: z.array(z.string().min(1).max(200)).min(1).max(4),
  checkInHint: z.string().max(200).optional(),
});

const extractSchema = z.object({
  actions: z.array(extractedActionSchema).min(1).max(8),
});

export type ExtractedAction = z.infer<typeof extractedActionSchema>;

const SYSTEM_PROMPT = `You turn messy spoken thoughts into action items with concrete next steps.

Given a transcript, extract every distinct thing the speaker wants to do.
Rewrite each as a concise, actionable title (verb-first, under 12 words).
Ignore filler, greetings, and repeated asides.

For each action, also give 2-4 next steps: the smallest physical things to do next
(call, email, book, buy, write, schedule). Not advice. Not summaries.

Classify each action into exactly one category:
- work: job, career, professional errands, colleagues
- family: household, partner, kids, relatives, caregiving
- hobbies: personal interests, creative projects, games, leisure
- extracurriculars: sports, clubs, volunteering, classes, community
- other: only if it truly does not fit the four above

Set priority high for urgent or time-sensitive items, low for someday/nice-to-have, otherwise medium.

Return JSON with exactly this shape:
{"actions":[{"title":"...","description":"optional extra context","category":"work","priority":"medium","nextSteps":["...","..."],"checkInHint":"optional when to revisit"}]}

description and checkInHint are optional.
Do not include markdown.`;

function parseJsonObject(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(trimmed);
}

function fallbackAction(transcript: string): ExtractedAction {
  const title = transcript.slice(0, 500).trim() || "Follow up on captured thought";
  return {
    title,
    category: "other",
    priority: "medium",
    nextSteps: ["Clarify what this is", "Decide the first 15-minute action"],
  };
}

export async function extractActionsFromThought(transcript: string): Promise<ExtractedAction[]> {
  const clipped = transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);
  let raw: string;
  try {
    raw = await chatCompletionJson([
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Transcript:\n${clipped}` },
    ]);
  } catch {
    return [fallbackAction(clipped)];
  }

  const parsed = extractSchema.safeParse(parseJsonObject(raw));
  if (!parsed.success) {
    return [fallbackAction(clipped)];
  }

  const cleaned = parsed.data.actions.map((action) => ({
    ...action,
    title: action.title.trim(),
    description: action.description?.trim() || undefined,
    nextSteps: action.nextSteps.map((step) => step.trim()).filter(Boolean).slice(0, 4),
    checkInHint: action.checkInHint?.trim() || undefined,
  })).filter((action) => action.title && action.nextSteps.length > 0);

  return cleaned.length > 0 ? cleaned : [fallbackAction(clipped)];
}
