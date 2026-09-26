/**
 * Spoken-transcript cleanup for Lock In.
 *
 * Adapted from FreeFlow's transcript sanitizer (quote/EMPTY stripping,
 * silence-hallucination filter gated on no-speech probability) and the
 * safe local half of its dictation cleanup: fillers, stutters, self-corrections,
 * and dictated punctuation. OpenWhispr's cleanup contract applies too: if the
 * polish would erase real words, the original text is kept.
 *
 * Lock In still routes the result into tasks, email, and calendar. This pass
 * does not refuse instructions or call a second model.
 */

const NO_SPEECH_THRESHOLD = 0.1;

/** Phrases Whisper emits for silence. Safe to drop even without segment metadata. */
const SILENCE_HALLUCINATIONS = new Set([
  "thank you for watching",
  "thanks for watching",
  "please subscribe",
  "like and subscribe",
  "subtitles by",
  "subtitles by the amaraorg community",
  "thanks for listening",
  "thank you for listening",
]);

/** Short phrases that are also real dictation, dropped only with a no-speech score. */
const CONDITIONAL_HALLUCINATIONS = new Set([
  "thank you",
  "thank you very much",
  "thank you so much",
  "thanks",
  "you",
]);

const BOILERPLATE =
  /^(?:here(?:'s| is) (?:the )?(?:cleaned |final )?(?:transcript|transcription|text)\s*[:,-]?\s*)/i;

const SCRATCH_THAT = /\s*,?\s*\bscratch that\b\s*,?\s*/i;
const NO_ACTUALLY = /\s*,?\s*\bno,?\s+actually\b\s*,?\s*/i;

/** Words that continue "no actually …" as a negation, not a self-correction. */
const NEGATION_FOLLOW = new Set([
  "any",
  "much",
  "many",
  "more",
  "good",
  "bad",
  "great",
  "real",
  "really",
  "very",
  "quite",
  "sure",
  "true",
  "useful",
  "important",
  "necessary",
  "possible",
  "going",
  "gonna",
  "want",
  "wanted",
  "need",
  "needed",
  "better",
  "worse",
  "even",
  "just",
  "so",
  "too",
  "all",
  "no",
  "not",
]);

const DETERMINER_FOLLOW = new Set(["a", "an", "the", "this", "that"]);

const FILLER = /\b(?:um+|uh+|er+|ah+|hmm+)\b[,]?/gi;

const STUTTER = /\b(the|a|an|i|to|and|we|it|my)\b(?:\s+\1\b)+/gi;

const PERIOD_WORD =
  /(?<!\b(?:the|a|an|this|that|of|for|per|time|trial|grace|waiting|fiscal|reporting)\s)\b(?:period|full stop)\b/gi;

const DETERMINERS = new Set(["the", "a", "an", "my", "this", "that", "our", "your"]);

export type PrepareTranscriptOptions = {
  /** Speech-to-text output. Typed notes skip the silence-hallucination list. */
  fromSpeech?: boolean;
  /** Whisper segment no_speech_prob. Only used when fromSpeech is set. */
  noSpeechProb?: number;
};

export function prepareTranscript(raw: string, options: PrepareTranscriptOptions = {}): string {
  const sanitized = sanitizeTranscript(raw);
  if (!sanitized) return "";

  const fromSpeech = options.fromSpeech === true || (options.fromSpeech !== false && options.noSpeechProb != null);

  if (fromSpeech && isSilenceHallucination(sanitized, options.noSpeechProb)) return "";

  const polished = polishSpokenText(sanitized);
  if (!polished) {
    if (fromSpeech && isSilenceHallucination(sanitized, options.noSpeechProb)) return "";
    if (!hasContent(sanitized)) return "";
    return finishSentence(sanitized);
  }
  if (fromSpeech && isSilenceHallucination(polished, options.noSpeechProb)) return "";
  return polished;
}

export function isEmptyTranscriptError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const parts = message.split(";").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((part) => /empty (?:gemini )?transcript/i.test(part));
}

function sanitizeTranscript(raw: string): string {
  let text = raw.replace(/\s+/g, " ").trim();
  if (!text) return "";

  if (
    (text.startsWith('"') && text.endsWith('"') && text.length > 1) ||
    (text.startsWith("“") && text.endsWith("”") && text.length > 1)
  ) {
    text = text.slice(1, -1).trim();
  }

  text = text.replace(BOILERPLATE, "").trim();
  if (text === "EMPTY") return "";
  return text;
}

function polishSpokenText(text: string): string {
  let next = text;
  next = next.replace(FILLER, " ");
  next = next.replace(/^(?:you know\s*,?\s*)+/i, "");
  next = next.replace(/(?:\s*,?\s*you know)+$/i, "");
  next = next.replace(STUTTER, "$1");
  next = collapseSpace(next);
  if (!next) return "";

  for (let pass = 0; pass < 3; pass += 1) {
    const corrected = applyCorrection(next);
    if (corrected === next) break;
    next = corrected;
  }

  next = next.replace(/\s+\bquestion mark\b/gi, "?");
  next = next.replace(/\s+\bexclamation (?:point|mark)\b/gi, "!");
  next = next.replace(/\s+\b(?:new line|newline)\b/gi, "\n");
  next = next.replace(/\s+\bcomma\b/gi, ",");
  next = next.replace(PERIOD_WORD, ".");
  next = next.replace(/[ \t]+([,.!?])/g, "$1");
  next = next.replace(/\bi\b/g, "I");
  return finishSentence(next);
}

function applyCorrection(text: string): string {
  const scratch = SCRATCH_THAT.exec(text);
  const noActually = NO_ACTUALLY.exec(text);
  const usableNoActually = noActually && !isNegationFollow(text, noActually) ? noActually : null;
  const match = earlierMatch(scratch, usableNoActually);
  if (!match || match.index === undefined) return text;

  const left = text.slice(0, match.index).trim();
  const right = text.slice(match.index + match[0].length).trim();
  if (!right) return collapseSpace(left.replace(/[,\s]+$/g, ""));

  const kept = dropAbandoned(left);
  return collapseSpace([kept, right].filter(Boolean).join(" "));
}

function isNegationFollow(text: string, match: RegExpExecArray): boolean {
  const right = text.slice((match.index ?? 0) + match[0].length).trim();
  const words = right.split(/\s+/).map((word) => word.toLowerCase().replace(/[^a-z]/g, ""));
  const first = words[0] ?? "";
  if (NEGATION_FOLLOW.has(first)) return true;
  if (DETERMINER_FOLLOW.has(first)) return NEGATION_FOLLOW.has(words[1] ?? "");
  return false;
}

function earlierMatch(left: RegExpExecArray | null, right: RegExpExecArray | null): RegExpExecArray | null {
  if (!left) return right;
  if (!right) return left;
  return left.index <= right.index ? left : right;
}

function dropAbandoned(left: string): string {
  const words = left.replace(/[,\s]+$/g, "").split(/\s+/).filter(Boolean);
  if (words.length <= 1) return "";

  for (let len = Math.min(4, words.length - 1); len >= 2; len -= 1) {
    const start = words[words.length - len];
    if (start && DETERMINERS.has(start.toLowerCase())) {
      return words.slice(0, words.length - len).join(" ");
    }
  }

  return words.slice(0, -1).join(" ");
}

function finishSentence(text: string): string {
  const collapsed = collapseSpace(text);
  if (!collapsed) return "";
  const capitalized = collapsed.replace(/^([^A-Za-z]*)([a-z])/, (_, prefix: string, letter: string) => {
    return prefix + letter.toUpperCase();
  });
  const words = capitalized.split(/\s+/).filter(Boolean);
  if (words.length < 2 || /[.!?,]$/.test(capitalized) || capitalized.includes("\n") || endsWithLink(capitalized)) {
    return capitalized;
  }
  return `${capitalized}.`;
}

function endsWithLink(text: string): boolean {
  const last = text.split(/\s+/).pop() ?? "";
  return /^(https?:\/\/|www\.)\S+$/i.test(last) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(last);
}

function collapseSpace(text: string): string {
  return text
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isSilenceHallucination(text: string, noSpeechProb?: number): boolean {
  const normalized = text
    .toLowerCase()
    .replace(/[.!?,;:'"“”]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return true;
  if (SILENCE_HALLUCINATIONS.has(normalized)) return true;
  if (
    typeof noSpeechProb === "number" &&
    noSpeechProb >= NO_SPEECH_THRESHOLD &&
    CONDITIONAL_HALLUCINATIONS.has(normalized)
  ) {
    return true;
  }
  return false;
}

function hasContent(text: string): boolean {
  const stripped = text
    .replace(FILLER, " ")
    .replace(/\byou know\b/gi, " ")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim();
  return stripped.length > 0;
}
