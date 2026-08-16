import { createChatClient, resolveGeminiConfig, resolveOpenRouterConfig } from "./llm";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function normalizeGeminiAudioMime(mime: string): string {
  const value = mime.toLowerCase();
  if (value === "audio/x-m4a" || value === "audio/m4a") return "audio/mp4";
  if (value === "audio/x-wav") return "audio/wav";
  if (value === "audio/mp3") return "audio/mpeg";
  return value;
}

function geminiModels(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  return [...new Set([preferred, "gemini-3.5-flash", "gemini-2.5-flash"].filter(Boolean))] as string[];
}

type GeminiGenerateResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
  }>;
};

function transcriptFromGemini(json: GeminiGenerateResponse): string {
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const spoken = parts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (spoken) return spoken;
  return parts
    .map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function transcribeWithGeminiModel(
  buffer: Buffer,
  mime: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts = [
    {
      inlineData: {
        mimeType: normalizeGeminiAudioMime(mime),
        data: buffer.toString("base64"),
      },
    },
    {
      text: "Transcribe this audio verbatim. Return only the spoken words, with no commentary or quotes.",
    },
  ];
  const payloads = [
    {
      contents: [{ parts }],
      generationConfig: { thinkingConfig: { thinkingBudget: 0 }, temperature: 0 },
    },
    { contents: [{ parts }] },
  ];

  let lastError = "Gemini transcribe failed";
  for (const payload of payloads) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      lastError = `Gemini transcribe HTTP ${res.status}: ${(await res.text()).slice(0, 240)}`;
      continue;
    }
    const json = (await res.json()) as GeminiGenerateResponse;
    const text = transcriptFromGemini(json);
    if (!text) {
      lastError = "Empty Gemini transcript";
      continue;
    }
    return text;
  }

  throw new Error(lastError);
}

async function transcribeWithGemini(buffer: Buffer, mime: string): Promise<string> {
  const config = resolveGeminiConfig();
  if (!config) {
    throw new Error("Gemini API key not set");
  }

  const errors: string[] = [];
  for (const model of geminiModels()) {
    try {
      return await transcribeWithGeminiModel(buffer, mime, config.apiKey, model);
    } catch (err) {
      errors.push(`${model}: ${errorMessage(err)}`);
    }
  }

  throw new Error(errors.join("; "));
}

async function transcribeWithOpenAICompat(
  buffer: Buffer,
  mime: string,
  filename: string,
): Promise<string> {
  const attempts = [];

  const openrouter = resolveOpenRouterConfig();
  if (openrouter) {
    attempts.push({
      ...openrouter,
      model: process.env.OPENROUTER_TRANSCRIBE_MODEL ?? "openai/whisper-large-v3",
    });
  }

  const openaiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const openaiBase = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  if (openaiKey && openaiBase) {
    attempts.push({
      provider: "custom" as const,
      baseURL: openaiBase,
      apiKey: openaiKey,
      model: "gpt-4o-mini-transcribe",
    });
  }

  if (attempts.length === 0) {
    throw new Error("No transcription fallback configured");
  }

  const errors: string[] = [];
  for (const config of attempts) {
    try {
      const client = createChatClient(config);
      const file = new File([new Uint8Array(buffer)], filename, { type: mime });
      const result = await client.audio.transcriptions.create({
        file,
        model: config.model,
        response_format: "json",
      });
      const text = result.text?.trim();
      if (!text) {
        throw new Error("Empty transcript");
      }
      return text;
    } catch (err) {
      errors.push(`${config.provider}: ${errorMessage(err)}`);
    }
  }

  throw new Error(`Transcription fallback failed (${errors.join("; ")})`);
}

export async function transcribeAudio(input: {
  buffer: Buffer;
  mime: string;
  filename: string;
}): Promise<string> {
  const errors: string[] = [];

  if (resolveGeminiConfig()) {
    try {
      return await transcribeWithGemini(input.buffer, input.mime);
    } catch (err) {
      errors.push(`gemini: ${errorMessage(err)}`);
    }
  }

  try {
    return await transcribeWithOpenAICompat(input.buffer, input.mime, input.filename);
  } catch (err) {
    errors.push(errorMessage(err));
  }

  throw new Error(`Transcription failed (${errors.join("; ") || "no providers configured"})`);
}
