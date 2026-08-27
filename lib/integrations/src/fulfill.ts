import { z } from "zod/v4";
import { chatCompletionJson } from "./llm";
import type { ExtractContext, ExtractedAction, ExtractResult, RouterItem } from "./extract";

const researchSchema = z.object({
  answer: z.string().min(1).max(4000),
  key_points: z.array(z.string().min(1).max(300)).min(2).max(8),
  open_questions: z.array(z.string().min(1).max(200)).max(5).optional().default([]),
  next_actions: z.array(z.string().min(1).max(200)).min(2).max(6),
});

const taskMapSchema = z.object({
  outcome: z.string().min(1).max(400),
  diagnosis: z.string().min(1).max(600),
  phases: z
    .array(
      z.object({
        name: z.string().min(1).max(80),
        why: z.string().min(1).max(200),
        moves: z.array(z.string().min(1).max(200)).min(1).max(5),
      }),
    )
    .min(2)
    .max(5),
  first_15_minutes: z.array(z.string().min(1).max(200)).min(2).max(5),
  blockers: z.array(z.string().min(1).max(200)).max(5).optional().default([]),
  done_when: z.array(z.string().min(1).max(200)).min(1).max(4),
  check_in: z.string().max(200).optional(),
});

const emailPolishSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  send_now: z.boolean(),
  missing: z.array(z.string()).optional().default([]),
});

export type Fulfillment = {
  summary: string;
  steps: string[];
  userTodos: string[];
  checkInHint?: string;
  researchAnswer?: string;
  email?: {
    subject: string;
    body: string;
    to: string[];
    sendNow: boolean;
    missing: string[];
  };
};

function peopleLine(item: RouterItem): string {
  const people = item.people ?? [];
  if (people.length === 0) return "none named";
  return people
    .map((p) => {
      const bits = [p.name];
      if (p.email) bits.push(`<${p.email}>`);
      if (p.company) bits.push(`(${p.company})`);
      return bits.join(" ");
    })
    .join("; ");
}

function emailsFromItem(item: RouterItem): string[] {
  return (item.people ?? [])
    .map((p) => p.email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email && email.includes("@")));
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(trimmed);
}

async function fulfillResearchNow(item: RouterItem): Promise<Fulfillment> {
  const brief = item.research_brief;
  const question =
    brief?.question?.trim() ||
    item.clean_text.trim() ||
    item.title.trim();
  const sub = (brief?.sub_questions ?? []).filter(Boolean).join("\n- ");
  const format = brief?.output_format || "summary";

  const raw = await chatCompletionJson(
    [
      {
        role: "system",
        content: `You are Lock In's research desk. Answer the user's question clearly and usefully.
Return JSON only with keys: answer, key_points, open_questions, next_actions.
- answer: the main response (${format}), under 400 words, plain text
- key_points: 3-6 sharp bullets
- open_questions: gaps that still need human judgment
- next_actions: 2-5 concrete things the user should do with this answer
Be direct. Do not invent citations or URLs. If unsure, say so and say what would resolve it.`,
      },
      {
        role: "user",
        content: `Title: ${item.title}\nQuestion: ${question}\nSub-questions:\n- ${sub || "none"}\nClean transcript: ${item.clean_text}`,
      },
    ],
    { temperature: 0.3 },
  );

  const parsed = researchSchema.parse(parseJsonObject(raw));
  return {
    summary: parsed.answer.slice(0, 1500),
    researchAnswer: parsed.answer,
    steps: [
      ...parsed.key_points.slice(0, 4),
      ...parsed.next_actions.slice(0, 2),
    ].slice(0, 8),
    userTodos: parsed.next_actions.slice(0, 4),
    checkInHint:
      parsed.open_questions[0] != null
        ? `Still open: ${parsed.open_questions[0]}`
        : undefined,
  };
}

async function fulfillResearchTopic(item: RouterItem): Promise<Fulfillment> {
  const brief = item.research_brief;
  const question = brief?.question?.trim() || item.title;
  const subs = (brief?.sub_questions ?? []).filter(Boolean);

  const raw = await chatCompletionJson(
    [
      {
        role: "system",
        content: `You are Lock In's reading-list curator. The user wants to save a topic for later — do NOT pretend you already researched it.
Return JSON with keys: answer, key_points, open_questions, next_actions.
- answer: a short brief on how to attack this topic later (under 180 words)
- key_points: the best angles / lenses to research
- open_questions: the questions worth answering
- next_actions: how to start the deep dive later (sources to open, people to ask, time box)`,
      },
      {
        role: "user",
        content: `Topic: ${question}\nSub-questions: ${subs.join("; ") || "none"}\nTranscript: ${item.clean_text}`,
      },
    ],
    { temperature: 0.3 },
  );

  const parsed = researchSchema.parse(parseJsonObject(raw));
  return {
    summary: `Saved for later: ${question}\n\n${parsed.answer}`.slice(0, 1500),
    steps: [...subs.slice(0, 3), ...parsed.key_points.slice(0, 3)].slice(0, 8),
    userTodos: parsed.next_actions.slice(0, 4),
    checkInHint: "Pick this up when you have a focused 45 minutes",
  };
}

async function fulfillTaskMap(item: RouterItem): Promise<Fulfillment> {
  const raw = await chatCompletionJson(
    [
      {
        role: "system",
        content: `You are Lock In's operator. The user voiced a task. Do not parrot it back.
Build a solve map — the shortest honest path from here to done.
Return JSON with:
- outcome: what "done" looks like in one sentence
- diagnosis: what this actually is / the real constraint (1-3 sentences)
- phases: 2-4 phases, each with name, why, and 1-4 moves
- first_15_minutes: 2-5 tiny actions to start now
- blockers: likely stuck points
- done_when: checklist that proves it's finished
- check_in: optional when to revisit
Be concrete. Name tools, people, artifacts. No motivational fluff.`,
      },
      {
        role: "user",
        content: `Title: ${item.title}\nClean text: ${item.clean_text}\nPeople: ${peopleLine(item)}\nDue: ${item.due_date || "none"}\nPriority: ${item.priority || "normal"}\nMissing: ${(item.missing_fields ?? []).join(", ") || "none"}\nClarifying: ${item.clarifying_question || "none"}`,
      },
    ],
    { temperature: 0.25 },
  );

  const parsed = taskMapSchema.parse(parseJsonObject(raw));
  const phaseSteps = parsed.phases.flatMap((phase) =>
    phase.moves.map((move) => `${phase.name}: ${move}`),
  );
  return {
    summary: `${parsed.outcome}\n\n${parsed.diagnosis}`.slice(0, 1500),
    steps: [...parsed.first_15_minutes, ...phaseSteps].slice(0, 10),
    userTodos: [...parsed.first_15_minutes.slice(0, 3), ...parsed.done_when.slice(0, 2)].slice(
      0,
      6,
    ),
    checkInHint: parsed.check_in || undefined,
  };
}

async function fulfillEmail(item: RouterItem, ctx: ExtractContext): Promise<Fulfillment> {
  const to = emailsFromItem(item);
  const draftSubject = item.draft?.subject?.trim() || item.title;
  const draftBody = item.draft?.body?.trim() || "";
  const isIntro = item.type === "intro_email";

  const raw = await chatCompletionJson(
    [
      {
        role: "system",
        content: `You are Lock In's email desk. Polish the draft so it is ready to send.
Return JSON: subject, body, send_now, missing.
- Keep body under 120 words, short sentences
- Sign off with the user name if known
- For intro emails: double opt-in by default unless the draft already is
- send_now: true only if recipients and facts are enough to send without inventing emails or claims
- missing: list anything blocking a send (e.g. "email for Priya")
Never invent an email address.`,
      },
      {
        role: "user",
        content: `Type: ${item.type}
User name: ${ctx.userName || "User"}
User email: ${ctx.userEmail || "unknown"}
People: ${peopleLine(item)}
Known recipient emails: ${to.join(", ") || "none"}
Draft subject: ${draftSubject}
Draft body:
${draftBody || "(empty — write one from the transcript)"}
Transcript: ${item.clean_text}
Is intro: ${isIntro ? "yes" : "no"}`,
      },
    ],
    { temperature: 0.2 },
  );

  const parsed = emailPolishSchema.parse(parseJsonObject(raw));
  const sendNow = parsed.send_now && to.length > 0 && parsed.missing.length === 0;

  return {
    summary: `${isIntro ? "Intro email" : "Email draft"}: ${parsed.subject}\n\n${parsed.body}`.slice(
      0,
      1500,
    ),
    steps: [
      sendNow ? `Send to ${to.join(", ")}` : "Confirm recipients before sending",
      `Subject: ${parsed.subject}`,
      ...parsed.body
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3),
    ].slice(0, 8),
    userTodos: sendNow
      ? ["Confirm the email went out", "Note any reply"]
      : [
          ...(parsed.missing.length > 0
            ? parsed.missing.map((m) => `Fill in: ${m}`)
            : ["Add recipient emails"]),
          "Send when ready",
        ],
    checkInHint: sendNow ? "Watch for replies in 2 days" : "Don’t send until missing fields are filled",
    email: {
      subject: parsed.subject,
      body: parsed.body,
      to,
      sendNow,
      missing: parsed.missing,
    },
  };
}

async function fulfillDecision(item: RouterItem): Promise<Fulfillment> {
  const status =
    (item.tags ?? []).find((t) => t.startsWith("status:"))?.replace("status:", "") || "decided";
  const raw = await chatCompletionJson(
    [
      {
        role: "system",
        content: `You are Lock In's decision log. Turn a voiced decision into a reusable record.
Return JSON: answer, key_points, open_questions, next_actions.
- answer: 2-4 sentences — what was decided (or must be decided), why it matters, implication
- key_points: context, options if spoken, owner, constraints — each one line
- open_questions: unresolved bits only
- next_actions: how to broadcast or lock the decision (docs, Slack, email) — concrete
Status hint from router: ${status}. Do not invent facts that were not spoken.`,
      },
      {
        role: "user",
        content: `Title: ${item.title}\nClean: ${item.clean_text}\nPeople: ${(item.people ?? []).map((p) => p.name).join(", ") || "none"}\nDue: ${item.due_date || "none"}\nTags: ${(item.tags ?? []).join(", ") || "none"}`,
      },
    ],
    { temperature: 0.2 },
  );
  const parsed = researchSchema.parse(parseJsonObject(raw));
  return {
    summary: parsed.answer.slice(0, 1500),
    steps: [...parsed.key_points, ...parsed.next_actions].slice(0, 8),
    userTodos: parsed.next_actions.slice(0, 4),
    checkInHint: parsed.open_questions[0]
      ? `Still open: ${parsed.open_questions[0]}`
      : item.due_date
        ? `Revisit by ${item.due_date}`
        : "Confirm this lives where the team will find it",
  };
}

async function fulfillReference(item: RouterItem): Promise<Fulfillment> {
  const sticky =
    item.draft?.body?.trim() ||
    item.clean_text.trim() ||
    item.title.trim();
  const kind =
    (item.tags ?? []).find((t) => t.startsWith("kind:"))?.replace("kind:", "") || "fact";
  const raw = await chatCompletionJson(
    [
      {
        role: "system",
        content: `You are Lock In's sticky reference desk. Preserve reusable facts for later search.
Return JSON: answer, key_points, open_questions, next_actions.
- answer: crisp restatement of the sticky note (kind=${kind}), under 120 words
- key_points: searchable aliases, related people/places, when it matters
- open_questions: only if the sticky is incomplete
- next_actions: where to park it (password manager, wiki, contacts) if obvious — else empty-ish tiny tips
Never invent codes, passwords, or URLs. Keep secrets as spoken or as [PLACEHOLDER].`,
      },
      {
        role: "user",
        content: `Label: ${item.title}\nSticky:\n${sticky}\nTags: ${(item.tags ?? []).join(", ") || "none"}`,
      },
    ],
    { temperature: 0.2 },
  );
  const parsed = researchSchema.parse(parseJsonObject(raw));
  return {
    summary: parsed.answer.slice(0, 1500),
    steps: [sticky.slice(0, 200), ...parsed.key_points.slice(0, 4), ...parsed.next_actions.slice(0, 2)].slice(
      0,
      8,
    ),
    userTodos:
      parsed.open_questions.length > 0
        ? parsed.open_questions.slice(0, 3).map((q) => `Clarify: ${q}`)
        : parsed.next_actions.slice(0, 3),
    checkInHint: "Search this note when you need it again",
  };
}

async function fulfillErrand(item: RouterItem): Promise<Fulfillment> {
  const location = item.location?.trim();
  const raw = await chatCompletionJson(
    [
      {
        role: "system",
        content: `You are Lock In's errand desk. One physical stop, dead simple.
Return JSON: answer, key_points, open_questions, next_actions.
- answer: one short paragraph — what to get/do and where
- key_points: checklist lines (qty, brand, size if spoken) — these are the shopping list
- open_questions: missing details that would cause a wasted trip
- next_actions: order of ops (route, bag, receipt)
Stay concrete. Do not invent a store if none was spoken.`,
      },
      {
        role: "user",
        content: `Errand: ${item.title}\nDetails: ${item.clean_text}\nLocation: ${location || "not said"}\nDue: ${item.due_date || "none"}\nTags: ${(item.tags ?? []).join(", ") || "none"}`,
      },
    ],
    { temperature: 0.2 },
  );
  const parsed = researchSchema.parse(parseJsonObject(raw));
  return {
    summary: parsed.answer.slice(0, 1500),
    steps: [
      ...(location ? [`Go to ${location}`] : []),
      ...parsed.key_points,
      ...parsed.next_actions,
    ].slice(0, 8),
    userTodos: parsed.key_points.slice(0, 4),
    checkInHint: item.due_date ? `Do this by ${item.due_date}` : "Knock it out on the next outing",
  };
}

async function fulfillWaitingOn(item: RouterItem): Promise<Fulfillment> {
  const who =
    (item.people ?? [])
      .map((p) => p.name)
      .filter(Boolean)
      .join(", ") || "someone";
  const raw = await chatCompletionJson(
    [
      {
        role: "system",
        content: `You are Lock In's waiting tracker. Someone else has the ball; the user is blocked.
Return JSON: answer, key_points, open_questions, next_actions.
- answer: what is owed, by whom, why it matters
- key_points: artifact expected, dependency, soft deadline
- open_questions: unclear bits
- next_actions: escalate ladder (nudge → clear ask → escalate) if it slips — not a full chase email unless asked
Keep tone calm and specific.`,
      },
      {
        role: "user",
        content: `Waiting on: ${who}\nNeed: ${item.title}\nDetails: ${item.clean_text}\nEscalate by: ${item.due_date || "not said"}\nTags: ${(item.tags ?? []).join(", ") || "none"}`,
      },
    ],
    { temperature: 0.2 },
  );
  const parsed = researchSchema.parse(parseJsonObject(raw));
  return {
    summary: parsed.answer.slice(0, 1500),
    steps: parsed.key_points.concat(parsed.next_actions).slice(0, 8),
    userTodos: parsed.next_actions.slice(0, 4),
    checkInHint: item.due_date
      ? `If still waiting by ${item.due_date}, escalate with ${who}`
      : `Ping ${who} if this stalls`,
  };
}

async function fulfillMessageDraft(item: RouterItem, ctx: ExtractContext): Promise<Fulfillment> {
  const channel =
    (item.tags ?? []).find((tag) =>
      ["slack", "text", "sms", "linkedin", "whatsapp", "imessage", "dm"].includes(tag.toLowerCase()),
    ) || "message";
  const to = emailsFromItem(item);
  const draftSubject = item.draft?.subject?.trim() || item.title;
  const draftBody = item.draft?.body?.trim() || "";

  const raw = await chatCompletionJson(
    [
      {
        role: "system",
        content: `You are Lock In's message desk for non-email channels (${channel}).
Return JSON: subject, body, send_now, missing.
- body: paste-ready for ${channel}, under 80 words, no email letterhead
- subject: short label for the note card (not an email subject unless LinkedIn InMail)
- send_now: false always (user pastes manually)
- missing: blockers (handle, phone, name, missing fact)
Sign with the user name only when it fits the channel. Never invent handles or phone numbers.`,
      },
      {
        role: "user",
        content: `Channel: ${channel}
User name: ${ctx.userName || "User"}
People: ${(item.people ?? []).map((p) => `${p.name}${p.email ? ` <${p.email}>` : ""}`).join("; ") || "none"}
Draft label: ${draftSubject}
Draft body:
${draftBody || "(empty — write one from the transcript)"}
Transcript: ${item.clean_text}`,
      },
    ],
    { temperature: 0.2 },
  );

  const parsed = emailPolishSchema.parse(parseJsonObject(raw));
  return {
    summary: `${channel} draft: ${parsed.subject}\n\n${parsed.body}`.slice(0, 1500),
    steps: [
      `Paste into ${channel}`,
      ...(item.people ?? []).map((p) => `To: ${p.name}`).slice(0, 2),
      ...parsed.body
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 3),
    ].slice(0, 8),
    userTodos:
      parsed.missing.length > 0
        ? parsed.missing.map((m) => `Fill in: ${m}`)
        : ["Paste and send", "Note any reply"],
    checkInHint: "Send when you are at the keyboard",
    email: {
      subject: parsed.subject,
      body: parsed.body,
      to,
      sendNow: false,
      missing: parsed.missing,
    },
  };
}

export async function fulfillRouterItem(
  item: RouterItem,
  ctx: ExtractContext = {},
): Promise<Fulfillment> {
  switch (item.type) {
    case "research_now":
      return fulfillResearchNow(item);
    case "research_topic":
      return fulfillResearchTopic(item);
    case "intro_email":
    case "email_draft":
      return fulfillEmail(item, ctx);
    case "message_draft":
      return fulfillMessageDraft(item, ctx);
    case "decision":
      return fulfillDecision(item);
    case "reference":
      return fulfillReference(item);
    case "errand":
      return fulfillErrand(item);
    case "waiting_on":
      return fulfillWaitingOn(item);
    case "follow_up":
    case "task":
    case "calendar_invite":
    default:
      return fulfillTaskMap(item);
  }
}

function applyFulfillment(action: ExtractedAction, item: RouterItem | undefined, fulfillment: Fulfillment): ExtractedAction {
  return {
    ...action,
    description: fulfillment.summary,
    nextSteps: fulfillment.steps.slice(0, 8).map((s) => s.slice(0, 200)),
    checkInHint: fulfillment.checkInHint ?? action.checkInHint,
    routerType: item?.type ?? action.routerType,
    fulfillment,
    source: item,
  };
}

/**
 * After routing, actually do the work: research, polish/send-ready email, or deep task map.
 * Failures fall back to the shallow router output so capture never dies mid-flight.
 */
export async function fulfillExtractResult(
  extracted: ExtractResult,
  ctx: ExtractContext = {},
): Promise<ExtractResult> {
  const items = extracted.items ?? [];
  const actions = await Promise.all(
    extracted.actions.map(async (action, index) => {
      const item =
        items[index] ??
        items.find((candidate) => candidate.title === action.title) ??
        undefined;
      if (!item) return action;
      try {
        const fulfillment = await fulfillRouterItem(item, ctx);
        return applyFulfillment(action, item, fulfillment);
      } catch {
        return { ...action, source: item };
      }
    }),
  );

  return {
    ...extracted,
    actions,
  };
}
