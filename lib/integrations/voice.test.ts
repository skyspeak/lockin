import assert from "node:assert/strict";
import test from "node:test";
import { createAudioLevelNormalizer } from "./src/audioLevel.ts";
import { presentCaptureError } from "./src/captureError.ts";
import { clampWords, looksLikeIntro, shortIntroEmail } from "./src/introEmail.ts";
import { isNetworkCaptureError, isRetryableCaptureStatus, retainPending } from "./src/pendingQueue.ts";
import { isEmptyTranscriptError, prepareTranscript } from "./src/transcript.ts";

test("strips silence hallucinations and keeps a real thank-you", () => {
  assert.equal(prepareTranscript("Thank you for watching.", { fromSpeech: true }), "");
  assert.equal(prepareTranscript("Subtitles by the Amara.org community", { fromSpeech: true }), "");
  assert.equal(prepareTranscript("Thank you.", { fromSpeech: true }), "Thank you.");
  assert.equal(prepareTranscript("Thank you.", { fromSpeech: true, noSpeechProb: 0.8 }), "");
  assert.equal(prepareTranscript("you", { fromSpeech: true }), "You");
  assert.equal(prepareTranscript("you", { fromSpeech: true, noSpeechProb: 0.2 }), "");
});

test("cleans fillers, stutters, and self-corrections without eating the task", () => {
  assert.equal(prepareTranscript("um buy milk", { fromSpeech: true }), "Buy milk.");
  assert.equal(prepareTranscript("the the meeting is tomorrow", { fromSpeech: true }), "The meeting is tomorrow.");
  assert.equal(prepareTranscript("had had a good day", { fromSpeech: true }), "Had had a good day.");
  assert.equal(
    prepareTranscript("let's meet Thursday no actually Wednesday after lunch", { fromSpeech: true }),
    "Let's meet Wednesday after lunch.",
  );
  assert.equal(prepareTranscript("Thursday, no actually Wednesday", { fromSpeech: true }), "Wednesday");
  assert.equal(
    prepareTranscript("meet at the coffee shop, no actually the office downtown", { fromSpeech: true }),
    "Meet at the office downtown.",
  );
  assert.equal(prepareTranscript("see you tomorrow period", { fromSpeech: true }), "See you tomorrow.");
  assert.equal(prepareTranscript("end of the period", { fromSpeech: true }), "End of the period.");
  assert.equal(prepareTranscript("hi dana comma", { fromSpeech: true }), "Hi dana,");
});

test("keeps real words when polish would otherwise return nothing useful", () => {
  assert.equal(prepareTranscript("um uh", { fromSpeech: true }), "");
  assert.equal(prepareTranscript('"buy oat milk"', { fromSpeech: true }), "Buy oat milk.");
  assert.equal(prepareTranscript("EMPTY", { fromSpeech: true }), "");
  assert.equal(
    prepareTranscript("Here is the cleaned transcript: email Sam", { fromSpeech: true }),
    "Email Sam.",
  );
  assert.equal(prepareTranscript("thank you for watching", { fromSpeech: false }), "Thank you for watching.");
});

test("empty-transcript errors are the only ones treated as silence", () => {
  assert.equal(isEmptyTranscriptError(new Error("gemini-2.5-flash: Empty Gemini transcript")), true);
  assert.equal(
    isEmptyTranscriptError(new Error("Transcription fallback failed (openrouter: Empty transcript)")),
    true,
  );
  assert.equal(
    isEmptyTranscriptError(
      new Error("gemini-2.5-flash: Gemini transcribe HTTP 500: no; gemini-2.0-flash: Empty Gemini transcript"),
    ),
    false,
  );
});

test("capture errors stay short", () => {
  assert.equal(presentCaptureError("Failed to fetch"), "Check your connection and try again.");
  assert.equal(presentCaptureError("Gemini transcribe HTTP 429: slow down"), "Transcription didn't come through. Try again.");
  assert.equal(presentCaptureError("Nothing captured. Try speaking again.", 400), "Nothing captured. Try speaking again.");
  assert.equal(presentCaptureError("too many capture requests", 429), "Wait a few seconds, then try again.");
});

test("only real transport failures count as network capture errors", () => {
  assert.equal(isNetworkCaptureError(new TypeError("Network request failed")), true);
  assert.equal(isNetworkCaptureError(new Error("Failed to fetch")), true);
  assert.equal(isNetworkCaptureError(new Error("The Internet connection appears to be offline.")), true);
  assert.equal(isNetworkCaptureError(new Error("Unexpected token < in JSON")), false);
  assert.equal(isNetworkCaptureError(new Error("LLM request failed")), false);
  assert.equal(isNetworkCaptureError(new Error("The request timed out.")), false);
  assert.equal(isNetworkCaptureError(Object.assign(new Error("Aborted"), { name: "AbortError" })), false);
});

test("negation and links survive cleanup", () => {
  assert.equal(
    prepareTranscript("There's no actually good reason to wait", { fromSpeech: true }),
    "There's no actually good reason to wait.",
  );
  assert.equal(
    prepareTranscript("It's no actually a good idea", { fromSpeech: true }),
    "It's no actually a good idea.",
  );
  assert.equal(
    prepareTranscript("buy milk scratch that oat milk", { fromSpeech: true }),
    "Buy oat milk.",
  );
  assert.equal(
    prepareTranscript("send the doc to https://example.com/file", { fromSpeech: true }),
    "Send the doc to https://example.com/file",
  );
  assert.equal(
    prepareTranscript("email sam@example.com", { fromSpeech: true }),
    "Email sam@example.com",
  );
});

test("intro emails stay short and do not end on an ellipsis", () => {
  const email = shortIntroEmail({
    people: [{ name: "Priya" }, { name: "Sam" }],
    userName: "George",
    cleanText: "Priya is hiring and Sam just left a similar role at a company that builds developer tools for long form spoken notes",
  });
  const words = email.body.split(/\s+/).filter(Boolean);
  assert.ok(words.length <= 60, email.body);
  assert.equal(email.body.includes("…"), false);
  assert.match(email.subject, /Priya/);
  assert.equal(looksLikeIntro("please introduce Priya to Sam"), true);
  assert.equal(looksLikeIntro("buy milk"), false);

  const clipped = clampWords(
    "First sentence stays. Second sentence is long enough to cross the limit and should not be the part we send along with a dangling ellipsis.",
    8,
  );
  assert.equal(clipped, "First sentence stays.");
});

test("offline queue keeps notes saved during a flush and does not retry rate limits", () => {
  const kept = retainPending(
    [
      { id: "old" },
      { id: "new" },
    ],
    new Set(["old"]),
    new Set(),
  );
  assert.deepEqual(kept.map((item) => item.id), ["new"]);
  assert.equal(isRetryableCaptureStatus(429), false);
  assert.equal(isRetryableCaptureStatus(500), true);
  assert.equal(isRetryableCaptureStatus(408), true);
  assert.equal(isRetryableCaptureStatus(400), false);
});

test("capture errors do not rewrite ordinary words", () => {
  assert.equal(
    presentCaptureError("Saved on the office network drive"),
    "Saved on the office network drive",
  );
});

test("mic level stays quiet in noise and opens on speech", () => {
  const quiet = createAudioLevelNormalizer();
  let quietLevel = 0;
  for (let i = 0; i < 8; i += 1) quietLevel = quiet.fromRms(0.0002);
  assert.ok(quietLevel < 0.08, `quiet level was ${quietLevel}`);

  const speaking = createAudioLevelNormalizer();
  let speechLevel = 0;
  for (let i = 0; i < 6; i += 1) speechLevel = speaking.fromRms(0.08);
  assert.ok(speechLevel >= 0.12, `speech level was ${speechLevel}`);

  speaking.reset();
  assert.equal(speaking.fromDb(-160), 0);
});
