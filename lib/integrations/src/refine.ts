import { z } from "zod/v4";
import { chatCompletionJson } from "./llm";

const refineSchema = z.object({
  title: z.string().min(1).max(500),
  nextSteps: z.array(z.string().min(1).max(200)).min(1).max(4),
});

export type RefinedAction = z.infer<typeof refineSchema>;

const SYSTEM_PROMPT = `You refine an existing task using a spoken note from the user.

Keep the same task. Do not invent a new unrelated task.
Tighten the title if needed (verb-first, under 12 words).
Replace next steps with 2-4 more actionable, concrete steps based on the refinement
(call, email, book, buy, write, schedule, open, send). Not advice. Not summaries.

Return JSON with exactly this shape:
{"title":"...","nextSteps":["...","..."]}

Do not include markdown.`;

function parseJsonObject(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(trimmed);
}

export async function refineActionFromNote(input: {
  title: string;
  nextSteps: string[];
  note: string;
}): Promise<RefinedAction> {
  const fallback: RefinedAction = {
    title: input.title,
    nextSteps:
      input.nextSteps.length > 0
        ? input.nextSteps.slice(0, 4)
        : ["Clarify the next 15-minute action", "Do that next step"],
  };

  const clipped = input.note.trim().slice(0, 4000);
  if (!clipped) return fallback;

  let raw: string;
  try {
    raw = await chatCompletionJson([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Current task: ${input.title}\nCurrent next steps:\n${input.nextSteps.map((step) => `- ${step}`).join("\n") || "- none"}\n\nSpoken refinement:\n${clipped}`,
      },
    ]);
  } catch {
    return fallback;
  }

  try {
    const parsed = refineSchema.safeParse(parseJsonObject(raw));
    if (!parsed.success) return fallback;
    const nextSteps = parsed.data.nextSteps.map((step) => step.trim()).filter(Boolean).slice(0, 4);
    const title = parsed.data.title.trim();
    if (!title || nextSteps.length === 0) return fallback;
    return { title, nextSteps };
  } catch {
    return fallback;
  }
}
