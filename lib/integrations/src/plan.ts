import { z } from "zod/v4";
import { chatCompletionJson } from "./llm";

const planContentSchema = z.object({
  summary: z.string().min(1),
  steps: z.array(z.string().min(1)).min(2).max(8),
  userTodos: z.array(z.string().min(1)).min(2).max(6),
  checkInHint: z.string().optional(),
});

export type FollowUpPlanContent = {
  summary: string;
  steps: string[];
  userTodos: { id: string; text: string; done: boolean }[];
  checkInHint: string | null;
};

const SYSTEM_PROMPT = `You help people follow up on tasks they captured by voice. Given a task title, produce a practical follow-up plan as JSON.

Output JSON with exactly these keys:
- summary: 1-2 sentences restating what the user wants to accomplish
- steps: 3-6 ordered action steps to move the task forward (strings)
- userTodos: 2-4 concrete todos ONLY the user can do — specific and small, not vague advice
- checkInHint: optional string suggesting when to follow up (e.g. "Check back Friday if no reply"); omit if not applicable

Be concise and actionable. Do not include markdown.`;

export async function generateFollowUpPlan(title: string): Promise<FollowUpPlanContent> {
  const raw = await chatCompletionJson([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Task: ${title}` },
  ]);

  const parsed = planContentSchema.parse(JSON.parse(raw));
  return {
    summary: parsed.summary,
    steps: parsed.steps,
    userTodos: parsed.userTodos.map((text, index) => ({
      id: `todo-${index + 1}`,
      text,
      done: false,
    })),
    checkInHint: parsed.checkInHint ?? null,
  };
}

export function isFollowUpPlansEnabled(): boolean {
  return process.env.FOLLOW_UP_PLANS_ENABLED !== "false";
}
