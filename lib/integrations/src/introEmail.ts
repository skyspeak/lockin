export const INTRO_EMAIL_WORD_LIMIT = 60;

/** Keep a sendable note inside a word limit, cutting on a sentence when one fits. */
export function clampWords(text: string, maxWords: number): string {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return trimmed;
  const clipped = words.slice(0, maxWords).join(" ");
  if (/[.!?]$/.test(clipped)) return clipped;
  const lastStop = Math.max(clipped.lastIndexOf(". "), clipped.lastIndexOf("! "), clipped.lastIndexOf("? "));
  if (lastStop >= 12) return clipped.slice(0, lastStop + 1).trim();
  return clipped.replace(/[,\s]+$/g, "");
}

export function looksLikeIntro(text: string): boolean {
  return /\b(intro|introduce|introduction|double[- ]opt[- ]in|put (them|you) in touch|connect\s+\S+\s+with)\b/i.test(
    text,
  );
}

export function shortIntroEmail(input: {
  subject?: string | null;
  body?: string | null;
  cleanText?: string | null;
  people?: Array<{ name?: string | null }>;
  userName?: string | null;
}): { subject: string; body: string } {
  const names = (input.people ?? [])
    .map((person) => person.name?.trim())
    .filter((name): name is string => Boolean(name));
  const userName = input.userName?.trim() || "Me";
  const subject = (
    input.subject?.trim() ||
    (names.length >= 2
      ? `Intro: ${names[0]} and ${names[1]}`
      : names[0]
        ? `Intro: ${names[0]}`
        : "Intro")
  ).slice(0, 140);

  let body = input.body?.trim() || "";
  if (!body) {
    const [first, second] = names;
    const reason = clampWords((input.cleanText || "").replace(/\s+/g, " ").trim(), 24);
    const reasonBit = reason ? `${reason} ` : "";
    if (first && second) {
      body = `Hi ${first} and ${second}. I'd like to introduce you. ${first}, meet ${second}. ${second}, meet ${first}. ${reasonBit}Reply if you'd like me to connect you. ${userName}`;
    } else if (first) {
      body = `Hi ${first}. I'd like to make an introduction. ${reasonBit}Reply if you're open to it. ${userName}`;
    } else {
      body = `${reasonBit || "I'd like to make an introduction. "}Reply if you're open to it. ${userName}`;
    }
  }
  return { subject, body: clampWords(body, INTRO_EMAIL_WORD_LIMIT) };
}
