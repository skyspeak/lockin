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

const extractedActionSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  category: z.enum(LIFE_AREAS),
  priority: z.enum(["low", "medium", "high"]),
});

const extractSchema = z.object({
  actions: z.array(extractedActionSchema).min(1).max(12),
});

export type ExtractedAction = z.infer<typeof extractedActionSchema>;

const SYSTEM_PROMPT = `You turn messy spoken thoughts into a short list of action items.

Given a transcript, extract every distinct thing the speaker wants to do.
Rewrite each as a concise, actionable title (verb-first, under 12 words).
Ignore filler, greetings, and repeated asides.

Classify each action into exactly one category:
- work: job, career, professional errands, colleagues
- family: household, partner, kids, relatives, caregiving
- hobbies: personal interests, creative projects, games, leisure
- extracurriculars: sports, clubs, volunteering, classes, community
- other: only if it truly does not fit the four above

Set priority high for urgent or time-sensitive items, low for someday/nice-to-have, otherwise medium.

Return JSON with exactly this shape:
{"actions":[{"title":"...","description":"optional extra context","category":"work","priority":"medium"}]}

description is optional — omit it unless needed to keep the title short.
Do not include markdown.`;

function parseJsonObject(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(trimmed);
}

export async function extractActionsFromThought(transcript: string): Promise<ExtractedAction[]> {
  const raw = await chatCompletionJson([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Transcript:\n${transcript}` },
  ]);

  const parsed = extractSchema.safeParse(parseJsonObject(raw));
  if (parsed.success) {
    return parsed.data.actions.map((action) => ({
      ...action,
      title: action.title.trim(),
      description: action.description?.trim() || undefined,
    }));
  }

  return [
    {
      title: transcript.slice(0, 500).trim() || "Follow up on captured thought",
      category: "other",
      priority: "medium",
    },
  ];
}
