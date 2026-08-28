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
const DEFAULT_TIMEZONE = "America/Los_Angeles";

const personSchema = z.object({
  name: z.string().min(1),
  email: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
});

export const ROUTER_TYPES = [
  "task",
  "intro_email",
  "email_draft",
  "follow_up",
  "calendar_invite",
  "research_now",
  "research_topic",
  "decision",
  "reference",
  "errand",
  "waiting_on",
  "message_draft",
] as const;

export type RouterType = (typeof ROUTER_TYPES)[number];

const routerItemSchema = z.object({
  id: z.string(),
  type: z.enum(ROUTER_TYPES),
  title: z.string().min(1).max(500),
  raw_text: z.string(),
  clean_text: z.string(),
  priority: z.enum(["high", "normal", "low"]).nullish().default("normal"),
  people: z.array(personSchema).nullish().default([]),
  due_date: z.string().nullable().optional(),
  start_datetime: z.string().nullable().optional(),
  end_datetime: z.string().nullable().optional(),
  duration_minutes: z.number().int().nullable().optional(),
  location: z.string().nullable().optional(),
  draft: z
    .object({
      subject: z.string().nullable().optional(),
      body: z.string().nullable().optional(),
    })
    .nullish(),
  research_brief: z
    .object({
      question: z.string().nullable().optional(),
      sub_questions: z.array(z.string()).nullish().default([]),
      output_format: z.string().nullable().optional(),
    })
    .nullish(),
  tags: z.array(z.string()).nullish().default([]),
  confidence: z.number(),
  alternate_type: z.string().nullable().optional(),
  needs_confirmation: z.boolean().nullish().default(false),
  missing_fields: z.array(z.string()).nullish().default([]),
  clarifying_question: z.string().nullable().optional(),
});

const routerSchema = z.object({
  items: z.array(routerItemSchema),
});

export type RouterItem = z.infer<typeof routerItemSchema>;
export type RouterResult = z.infer<typeof routerSchema>;

export type ExtractedAction = {
  title: string;
  description?: string;
  category: LifeArea;
  priority: "low" | "medium" | "high";
  nextSteps: string[];
  checkInHint?: string;
  routerType?: RouterItem["type"];
  confidence?: number;
  source?: RouterItem;
  fulfillment?: {
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
};

export type ExtractedEvent = {
  title: string;
  start: string;
  durationMinutes?: number;
  attendeeEmails?: string[];
};

export type ExtractResult = {
  actions: ExtractedAction[];
  events: ExtractedEvent[];
  items?: RouterItem[];
};

export type ExtractContext = {
  userName?: string;
  userEmail?: string;
  contactsJson?: string;
  timeZone?: string;
};

const extractedActionSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  category: z.enum(LIFE_AREAS),
  priority: z.enum(["low", "medium", "high"]),
  nextSteps: z.array(z.string().min(1).max(200)).min(1).max(4),
  checkInHint: z.string().max(200).optional(),
});

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          type: {
            type: "string",
            enum: [...ROUTER_TYPES],
          },
          title: { type: "string" },
          raw_text: { type: "string" },
          clean_text: { type: "string" },
          priority: { type: "string", enum: ["high", "normal", "low"] },
          people: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                email: { type: "string", nullable: true },
                company: { type: "string", nullable: true },
                role: { type: "string", nullable: true },
              },
              required: ["name"],
            },
          },
          due_date: { type: "string", nullable: true },
          start_datetime: { type: "string", nullable: true },
          end_datetime: { type: "string", nullable: true },
          duration_minutes: { type: "integer", nullable: true },
          location: { type: "string", nullable: true },
          draft: {
            type: "object",
            properties: {
              subject: { type: "string", nullable: true },
              body: { type: "string", nullable: true },
            },
          },
          research_brief: {
            type: "object",
            properties: {
              question: { type: "string", nullable: true },
              sub_questions: { type: "array", items: { type: "string" } },
              output_format: { type: "string", nullable: true },
            },
          },
          tags: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          alternate_type: { type: "string", nullable: true },
          needs_confirmation: { type: "boolean" },
          missing_fields: { type: "array", items: { type: "string" } },
          clarifying_question: { type: "string", nullable: true },
        },
        required: ["id", "type", "title", "raw_text", "clean_text", "confidence"],
      },
    },
  },
  required: ["items"],
} as const;

const SYSTEM_PROMPT_TEMPLATE = `You are a capture router. You read one voice transcript. You convert it into structured items. You do not talk to the user. You return JSON only.

### Context variables

- Current date and time: {{NOW_ISO}}
- Time zone: {{TIMEZONE}}
- User name: {{USER_NAME}}
- User email: {{USER_EMAIL}}
- Known contacts (name, email, company): {{CONTACTS_JSON}}

### Input conditions

The input is speech to text output. Expect these problems:

- Filler words: uh, um, like, you know, I mean, so yeah.
- No punctuation, or wrong punctuation.
- Self correction. Example: "call Ravi, no wait, call Priya."
- Wrong words from sound errors. Example: "sink up" means "sync up". "Cal invite" means "calendar invite".
- Wrong spelling of names, companies, and products.
- More than one item in one breath, joined by "and" or "also".

### Step 1. Clean the text

1. Remove filler words.
2. Apply the last self correction. Discard the part that the user cancelled.
3. Correct obvious sound errors only when the correct word is clear from context.
4. Keep the original transcript in \`raw_text\`. Put the corrected text in \`clean_text\`.
5. Do not add facts. Do not invent an email address, a phone number, or a company name.

### Step 2. Split the text

Split the transcript into separate items. One item holds one action. Split on "and", "also", "next", "another thing", or a clear change of subject. Do not split a single action that has many details.

### Step 3. Classify each item

Test the rules in this order. Stop at the first rule that matches.

| Order | type | Match condition | Trigger words |
|---|---|---|---|
| 1 | \`calendar_invite\` | The user wants a meeting or a time block with a start time | invite, schedule, book, set up a call, put on my calendar, block time, meet at |
| 2 | \`intro_email\` | The user wants to connect two other people to each other | intro, introduce, connect X with Y, double opt-in, put them in touch |
| 3 | \`email_draft\` | The user wants an email written to one or more people, and it is not an intro | email, write to, reply to, send a note, draft an email, follow up by email |
| 4 | \`message_draft\` | The user wants a non-email message drafted for paste reuse (text, Slack, LinkedIn, WhatsApp) | text, slack, DM, linkedin, WhatsApp, ping on Slack, message them on |
| 5 | \`follow_up\` | The user wants to check back on an open thread at a later time | follow up, check back, chase, ping again, circle back, nudge, if I do not hear back |
| 6 | \`waiting_on\` | Someone else owes the user a deliverable; the user is blocked | waiting on, blocked on, need them to, once they send, still waiting for, ball is in their court |
| 7 | \`errand\` | A physical-world stop: buy, pick up, drop off, return, ship | buy, pick up, drop off, grocery, pharmacy, return, ship, grab from, stop by, mail the |
| 8 | \`decision\` | Logging a choice that was made, or a choice that must be made | decide, decided, going with, we're choosing, call it, the decision is, pick between, settled on |
| 9 | \`reference\` | Parking a reusable fact, quote, code, or sticky note to find later | remember that, note that, for the record, parking code, the wifi is, save this, sticky, FYI to self |
| 10 | \`research_now\` | The user wants an answer inside the app in this session | look up, find out, what is, who is, tell me about, search for, right now |
| 11 | \`research_topic\` | The user wants to store a subject for later study | research, dig into, deep dive, read up on, add to my reading list, someday |
| 12 | \`task\` | Everything else, and any item you cannot classify | do, fix, call, pay, send, remember to, get this done, I promised, I owe |

Rules for hard cases:

- Rule 3 beats rule 5 when the user names the email and the send time in the same breath. Example: "email Sam tomorrow about the invoice" is \`email_draft\` with a \`due_date\`.
- Rule 4 wins over rule 3 when the channel is clearly not email (Slack, text, LinkedIn, WhatsApp).
- Rule 5 wins when there is no new message content, only a time to check. Example: "follow up with Sam next week" is \`follow_up\`.
- Rule 6 wins over rule 5 when the user is blocked waiting for someone else's deliverable, not planning their own chase message. Example: "still waiting on legal for the redline" is \`waiting_on\`.
- Rule 7 beats \`task\` for buy / pick up / drop off / return / grocery / stop-by language. Online-only "buy the domain" stays \`task\`.
- Rule 8 wins when the point is to record a choice, not to execute work. Example: "we're going with Acme for payroll" is \`decision\`. If they also say "and tell the team", split into \`decision\` + \`message_draft\` or \`email_draft\`.
- Rule 9 wins for sticky facts meant to be looked up later. "Idea to build X this quarter" with ship intent is \`task\`. "What if we tried voice inbox someday" with no ship ask is \`reference\` tagged \`idea\`.
- Rule 10 wins over rule 11 when the user asks a question with a short answer. Rule 11 wins when the subject is broad.
- "I promised Sam the deck by Friday" is \`task\` (user owes work), not \`waiting_on\`.
- If you cannot decide between two types, pick \`task\`, set \`confidence\` below 0.6, and write both options into \`alternate_type\`.

### Step 4. Fill the fields

**Dates and times**

- Resolve all relative dates against {{NOW_ISO}} in {{TIMEZONE}}.
- Write dates in ISO 8601 with the offset. Example: \`2026-08-25T09:00:00-07:00\`.
- "Morning" is 09:00. "Afternoon" is 14:00. "Evening" is 18:00. "End of day" is 17:00.
- "Next week" without a day is the next Monday.
- If the item has a time but no length, set \`duration_minutes\` to 30 for a call and 60 for a meeting.
- If there is no date, set the date fields to null. Do not guess a date for a \`task\`.

**People**

- Match each name against \`{{CONTACTS_JSON}}\`. On a match, copy the email.
- On no match, fill the \`name\` field only. Leave \`email\` as null. Add \`email\` to \`missing_fields\`.
- Sound-alike names count as a match only when one contact is close. On two or more close contacts, set \`needs_confirmation\` to true and list the candidates in \`clarifying_question\`.

**Drafts**

- For \`intro_email\`, \`email_draft\`, and \`message_draft\`, write a subject and a body.
- Keep the body under 120 words. Use short sentences. Use the user name in the sign off.
- For \`intro_email\`, write a double opt-in note by default. Give one line on each person and one line on the reason for the intro.
- For \`message_draft\`, put the channel in \`tags\` (e.g. \`slack\`, \`text\`, \`linkedin\`) and keep the body paste-ready.
- Use \`[PLACEHOLDER: ...]\` for any fact you do not have. Never invent the fact.

**Research**

- For both research types, write the main question in one sentence.
- Add 3 to 6 sub questions.
- Set \`output_format\` to one of: \`summary\`, \`table\`, \`list\`, \`memo\`.

**Reusable note types**

- \`decision\`: title = the choice in one line ("Use Notion for wiki"). \`clean_text\` = why / options / who decided. Tags: \`status:decided\` or \`status:pending\`, plus a domain tag (\`payroll\`, \`tooling\`). Set \`due_date\` only for decide-by. Put owners in \`people\`.
- \`reference\`: title = short label you would search later. Put the full sticky content in \`draft.body\` (and mirror in \`clean_text\`). Tags: \`kind:fact\`, \`kind:quote\`, \`kind:code\`, \`kind:idea\`, or \`kind:link\`, plus theme tags. Never invent secrets; if a code/password was mumbled unclearly, put \`[PLACEHOLDER: code]\` and add to \`missing_fields\`.
- \`errand\`: title = verb + item ("Pick up oat milk"). \`location\` = store/place. Tags: \`buy\`, \`pickup\`, \`dropoff\`, \`return\`, \`ship\`. Checklist extras stay in \`clean_text\`.
- \`waiting_on\`: \`people\` = who has the ball. \`title\` = what you need from them. \`due_date\` = when to escalate. Tags: \`blocked\`, artifact name if spoken (\`redline\`, \`pricing\`).
- \`message_draft\`: same draft rules as email, but channel is not email. Always set a channel tag: \`slack\`, \`text\`, \`linkedin\`, \`whatsapp\`, or \`dm\`.

### Step 5. Score and check

- Set \`confidence\` from 0.0 to 1.0 for the classification.
- List every empty field that the type needs in \`missing_fields\`.
- Write one short question in \`clarifying_question\` when the item cannot go forward. Otherwise set it to null.

### Hard rules

1. Return one JSON object. Return nothing else.
2. Do not use markdown fences.
3. Do not ask the user a question in prose. Put questions in the \`clarifying_question\` field.
4. Do not drop an item because it is unclear. Send it out as a \`task\` with low confidence.
5. If the transcript holds no action, return \`{"items": []}\`.
6. Never invent an email address, a URL, a price, or a date.

### Output shape

Always send every key. Use null or an empty array for a field that the type does not need.

\`\`\`json
{
  "items": [
    {
      "id": "1",
      "type": "calendar_invite",
      "title": "Call with Priya Nair about the pilot",
      "raw_text": "uh set up a cal invite with priya for tuesday morning about the pilot",
      "clean_text": "Set up a calendar invite with Priya for Tuesday morning about the pilot.",
      "priority": "normal",
      "people": [
        {"name": "Priya Nair", "email": "priya@acme.com", "company": "Acme", "role": null}
      ],
      "due_date": null,
      "start_datetime": "2026-08-25T09:00:00-07:00",
      "end_datetime": "2026-08-25T09:30:00-07:00",
      "duration_minutes": 30,
      "location": null,
      "draft": {"subject": null, "body": null},
      "research_brief": {"question": null, "sub_questions": [], "output_format": null},
      "tags": ["pilot"],
      "confidence": 0.91,
      "alternate_type": null,
      "needs_confirmation": false,
      "missing_fields": ["location"],
      "clarifying_question": null
    }
  ]
}
\`\`\`

### Few-shot behaviour

**Example 1. Many items in one breath**
Input: "uh remind me to pay the water bill and also I need to intro Sarah at Vanta to Dev, and uh look up what ISO 42001 surveillance audits cost"
Output: three items. Item 1 is \`task\`. Item 2 is \`intro_email\`. Item 3 is \`research_now\`.

**Example 2. Self correction and a sound error**
Input: "set up a sink up with uh Marcus, no sorry with Marcus and Lena, Thursday afternoon, cal invite"
Output: one \`calendar_invite\`. \`clean_text\` reads "Set up a sync-up with Marcus and Lena on Thursday afternoon." Both people appear in \`people\`. \`start_datetime\` is Thursday at 14:00.

**Example 3. Unclear item**
Input: "uh the Hyland thing"
Output: one \`task\`. \`title\` is "Hyland thing". \`confidence\` is 0.3. \`clarifying_question\` asks what action Hyland needs.

**Example 4. Follow-up against email**
Input: "follow up with the Box legal team next Wednesday if they have not sent the redline"
Output: one \`follow_up\`. \`due_date\` is next Wednesday. \`draft\` stays null, because the user gave a trigger condition and not message content.

**Example 5. Reusable note types**
Input: "we decided to go with Notion for the wiki, and remember the building wifi is lockin-guest, and pick up oat milk at Trader Joe's, and still waiting on Priya for the pricing sheet, and draft a Slack to Dev saying the pilot is a go"
Output: five items —
1. \`decision\` — title "Use Notion for the wiki", tags include \`status:decided\`
2. \`reference\` — title "Building wifi", \`draft.body\` holds the network name, tag \`kind:code\`
3. \`errand\` — title "Pick up oat milk", location "Trader Joe's"
4. \`waiting_on\` — people Priya, title about pricing sheet
5. \`message_draft\` — tag \`slack\`, paste-ready body to Dev

**Example 6. Decision vs task vs waiting**
Input: "I promised Sam the deck Friday, and we're still waiting on legal for the redline, and we settled on Acme for payroll"
Output: \`task\` (promise to Sam), \`waiting_on\` (legal), \`decision\` (Acme payroll).

### Research types

| type | User wants | App behaviour |
|---|---|---|
| \`research_now\` | An answer in this session | Run the search. Show the answer. |
| \`research_topic\` | A saved subject for later | Store the brief. Do not run the search. |

### Reusable note types

| type | User wants | App behaviour |
|---|---|---|
| \`decision\` | A logged choice | Capture choice, context, owner, revisit date. |
| \`reference\` | A sticky fact to find later | Save labeled content for search/reuse. |
| \`errand\` | A real-world stop | Checklist for buy / pick up / drop off. |
| \`waiting_on\` | Someone else has the ball | Track who, what, escalate-by. |
| \`message_draft\` | A non-email message | Draft paste-ready Slack / text / LinkedIn copy. |`;

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function nowIsoInTimeZone(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "shortOffset",
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  let hour = get("hour");
  if (hour === "24") hour = "00";
  const minute = get("minute");
  const second = get("second");
  const offsetRaw = get("timeZoneName") || "GMT";
  const offset = offsetRaw.replace("GMT", "").replace("UTC", "") || "+00:00";
  const normalized =
    offset === ""
      ? "+00:00"
      : /^[+-]\d{2}$/.test(offset)
        ? `${offset}:00`
        : /^[+-]\d{2}\d{2}$/.test(offset)
          ? `${offset.slice(0, 3)}:${offset.slice(3)}`
          : offset.startsWith("+") || offset.startsWith("-")
            ? offset
            : `+${offset}`;

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${normalized}`;
}

function parseJsonObject(raw: string): unknown {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  return JSON.parse(trimmed);
}

function mapPriority(priority: "high" | "normal" | "low" | null | undefined): "low" | "medium" | "high" {
  if (priority === "high") return "high";
  if (priority === "low") return "low";
  return "medium";
}

function mapCategory(type: RouterItem["type"]): LifeArea {
  switch (type) {
    case "calendar_invite":
    case "intro_email":
    case "email_draft":
    case "message_draft":
    case "follow_up":
    case "waiting_on":
    case "decision":
      return "work";
    case "research_now":
    case "research_topic":
    case "reference":
      return "hobbies";
    case "errand":
      return "family";
    default:
      return "other";
  }
}

function nextStepsFromItem(item: RouterItem): string[] {
  const steps: string[] = [];
  const draft = item.draft;
  if (draft?.subject?.trim()) steps.push(`Subject: ${draft.subject.trim()}`);
  if (draft?.body?.trim()) {
    const firstLine = draft.body.trim().split(/\n+/)[0]?.slice(0, 160);
    if (firstLine) steps.push(firstLine);
  }
  const brief = item.research_brief;
  if (brief?.question?.trim()) steps.push(brief.question.trim());
  for (const q of brief?.sub_questions ?? []) {
    if (steps.length >= 4) break;
    const trimmed = q.trim();
    if (trimmed) steps.push(trimmed.slice(0, 200));
  }
  if (item.type === "calendar_invite") {
    if (item.start_datetime) steps.push(`Starts ${item.start_datetime}`);
    if (item.location?.trim()) steps.push(`Location: ${item.location.trim()}`);
  }
  if (item.type === "follow_up" && item.due_date) {
    steps.push(`Check back by ${item.due_date}`);
  }
  if (item.type === "waiting_on" && item.due_date) {
    steps.push(`Escalate by ${item.due_date}`);
  }
  if (item.type === "errand" && item.location?.trim()) {
    steps.push(`At: ${item.location.trim()}`);
  }
  if (item.type === "decision") {
    const status = (item.tags ?? []).find((t) => t.startsWith("status:"));
    steps.push(status === "status:pending" ? "Decide and lock it in" : "Share the decision where it sticks");
    if (item.due_date) steps.push(`Revisit by ${item.due_date}`);
  }
  if (item.type === "reference") {
    const body = item.draft?.body?.trim() || item.clean_text.trim();
    if (body) steps.push(body.slice(0, 200));
    steps.push("Keep this sticky for later search");
  }
  if (item.clarifying_question?.trim() && steps.length < 4) {
    steps.push(item.clarifying_question.trim().slice(0, 200));
  }
  if ((item.missing_fields ?? []).length > 0 && steps.length < 4) {
    steps.push(`Fill in: ${(item.missing_fields ?? []).join(", ")}`);
  }
  if (steps.length === 0) {
    steps.push("Decide the first 15-minute action");
    if (item.clean_text.trim()) steps.push(item.clean_text.trim().slice(0, 200));
  }
  return steps.map((s) => s.trim()).filter(Boolean).slice(0, 4);
}

function descriptionFromItem(item: RouterItem): string | undefined {
  const parts = [item.clean_text.trim()];
  if (item.draft?.body?.trim()) parts.push(item.draft.body.trim());
  if (item.research_brief?.question?.trim()) parts.push(item.research_brief.question.trim());
  const text = parts.filter(Boolean).join("\n\n").slice(0, 2000);
  return text || undefined;
}

function checkInHintFromItem(item: RouterItem): string | undefined {
  if (item.type === "follow_up" && item.due_date) return `Follow up by ${item.due_date}`;
  if (item.clarifying_question?.trim()) return item.clarifying_question.trim().slice(0, 200);
  return undefined;
}

function eventFromItem(item: RouterItem): ExtractedEvent | null {
  if (item.type !== "calendar_invite") return null;
  const start = item.start_datetime?.trim();
  if (!start || Number.isNaN(new Date(start).getTime())) return null;
  const attendeeEmails = (item.people ?? [])
    .map((p) => p.email?.trim().toLowerCase())
    .filter((email): email is string => Boolean(email && email.includes("@")));
  let durationMinutes = item.duration_minutes ?? undefined;
  if (!durationMinutes && item.end_datetime) {
    const end = new Date(item.end_datetime);
    const startDate = new Date(start);
    if (!Number.isNaN(end.getTime())) {
      durationMinutes = Math.max(15, Math.round((end.getTime() - startDate.getTime()) / 60_000));
    }
  }
  return {
    title: item.title.trim(),
    start,
    durationMinutes: durationMinutes ?? 60,
    attendeeEmails: attendeeEmails.length > 0 ? attendeeEmails.slice(0, 8) : undefined,
  };
}

function actionFromItem(item: RouterItem): ExtractedAction {
  return {
    title: item.title.trim().slice(0, 500),
    description: descriptionFromItem(item),
    category: mapCategory(item.type),
    priority: mapPriority(item.priority),
    nextSteps: nextStepsFromItem(item),
    checkInHint: checkInHintFromItem(item),
    routerType: item.type,
    confidence: item.confidence,
    source: item,
  };
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

function mapRouterToExtract(items: RouterItem[], transcript: string): ExtractResult {
  const actions = items.map(actionFromItem).filter((a) => a.title && a.nextSteps.length > 0);
  const events = items.map(eventFromItem).filter((e): e is ExtractedEvent => Boolean(e));
  return {
    actions: actions.length > 0 ? actions : [fallbackAction(transcript)],
    events,
    items,
  };
}

export async function extractFromThought(
  transcript: string,
  now = new Date(),
  context: ExtractContext = {},
): Promise<ExtractResult> {
  const clipped = transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS);
  const timeZone = context.timeZone || process.env.LOCKIN_TIMEZONE || DEFAULT_TIMEZONE;
  const userName = context.userName || process.env.LOCKIN_USER_NAME || "User";
  const userEmail = context.userEmail || process.env.LOCKIN_USER_EMAIL || "";
  const contactsJson = context.contactsJson || process.env.LOCKIN_CONTACTS_JSON || "[]";
  const nowIso = nowIsoInTimeZone(now, timeZone);

  const systemPrompt = fillTemplate(SYSTEM_PROMPT_TEMPLATE, {
    NOW_ISO: nowIso,
    TIMEZONE: timeZone,
    USER_NAME: userName,
    USER_EMAIL: userEmail,
    CONTACTS_JSON: contactsJson,
  });

  let raw: string;
  try {
    raw = await chatCompletionJson(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: clipped },
      ],
      {
        temperature: 0.1,
        responseSchema: RESPONSE_SCHEMA,
      },
    );
  } catch {
    return { actions: [fallbackAction(clipped)], events: [] };
  }

  let parsedJson: unknown;
  try {
    parsedJson = parseJsonObject(raw);
  } catch {
    return { actions: [fallbackAction(clipped)], events: [] };
  }

  const parsed = routerSchema.safeParse(parsedJson);
  if (!parsed.success) {
    // Legacy shape fallback if a model still returns actions/events
    const legacy = z
      .object({
        actions: z.array(extractedActionSchema).min(1).max(8),
        events: z
          .array(
            z.object({
              title: z.string().min(1).max(200),
              start: z.string().min(1).max(80),
              durationMinutes: z.number().int().min(15).max(480).optional(),
              attendeeEmails: z.array(z.string().email()).max(8).optional(),
            }),
          )
          .max(8)
          .optional(),
      })
      .safeParse(parsedJson);
    if (legacy.success) {
      return {
        actions: legacy.data.actions,
        events: legacy.data.events ?? [],
      };
    }
    return { actions: [fallbackAction(clipped)], events: [] };
  }

  if (parsed.data.items.length === 0) {
    return { actions: [fallbackAction(clipped)], events: [], items: [] };
  }

  return mapRouterToExtract(parsed.data.items, clipped);
}

export async function extractActionsFromThought(transcript: string): Promise<ExtractedAction[]> {
  const result = await extractFromThought(transcript);
  return result.actions;
}
