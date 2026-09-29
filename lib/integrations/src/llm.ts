import OpenAI from "openai";

export type ChatProvider = "openrouter" | "gemini" | "custom";

export type ChatConfig = {
  provider: ChatProvider;
  baseURL: string;
  apiKey: string;
  model: string;
};

const OPENROUTER_DEFAULTS = {
  baseURL: "https://openrouter.ai/api/v1",
  model: "google/gemini-2.5-flash",
} as const;

const GEMINI_DEFAULTS = {
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  // 3.5-flash is real but often 503 / burns tokens on "thinking" and returns
  // empty or non-JSON. Prefer 2.5-flash; keep 3.5 in the fallback list.
  model: "gemini-2.5-flash",
} as const;

/** Stable Flash IDs to try when the configured Gemini model fails. */
export const GEMINI_CHAT_FALLBACKS = [
  "gemini-2.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-3.5-flash",
] as const;

/** OpenRouter chat models when the preferred one is out / 402 / 404. */
export const OPENROUTER_CHAT_FALLBACKS = [
  "google/gemini-2.5-flash",
  "google/gemini-3.5-flash-lite",
  "openai/gpt-4o-mini",
] as const;

function parseProvider(raw: string | undefined): ChatProvider {
  const value = raw?.toLowerCase();
  if (value === "openrouter" || value === "gemini" || value === "custom") {
    return value;
  }
  return "openrouter";
}

export function resolveGeminiConfig(): ChatConfig | null {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  if (!apiKey) return null;
  return {
    provider: "gemini",
    baseURL: GEMINI_DEFAULTS.baseURL,
    apiKey,
    model: process.env.GEMINI_MODEL ?? GEMINI_DEFAULTS.model,
  };
}

export function resolveOpenRouterConfig(): ChatConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  if (!apiKey) return null;
  return {
    provider: "openrouter",
    baseURL: OPENROUTER_DEFAULTS.baseURL,
    apiKey,
    model: process.env.OPENROUTER_MODEL ?? OPENROUTER_DEFAULTS.model,
  };
}

export function resolveChatConfig(): ChatConfig {
  const gemini = resolveGeminiConfig();
  if (gemini) return gemini;

  const openrouter = resolveOpenRouterConfig();
  if (openrouter) return openrouter;

  const provider = parseProvider(process.env.AI_CHAT_PROVIDER ?? process.env.AI_PROVIDER);

  if (provider === "openrouter") {
    return {
      provider,
      baseURL: process.env.AI_CHAT_BASE_URL ?? OPENROUTER_DEFAULTS.baseURL,
      apiKey:
        process.env.AI_CHAT_API_KEY ??
        process.env.OPENROUTER_API_KEY ??
        process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
        "",
      model: process.env.AI_CHAT_MODEL ?? OPENROUTER_DEFAULTS.model,
    };
  }

  if (provider === "gemini") {
    return {
      provider,
      baseURL: process.env.AI_CHAT_BASE_URL ?? GEMINI_DEFAULTS.baseURL,
      apiKey:
        process.env.AI_CHAT_API_KEY ??
        process.env.GEMINI_API_KEY ??
        process.env.GOOGLE_API_KEY ??
        "",
      model: process.env.AI_CHAT_MODEL ?? GEMINI_DEFAULTS.model,
    };
  }

  return {
    provider: "custom",
    baseURL:
      process.env.AI_CHAT_BASE_URL ??
      process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??
      "",
    apiKey:
      process.env.AI_CHAT_API_KEY ?? process.env.AI_INTEGRATIONS_OPENAI_API_KEY ?? "",
    model: process.env.AI_CHAT_MODEL ?? "gpt-4o-mini",
  };
}

export function createChatClient(config = resolveChatConfig()): OpenAI {
  if (!config.apiKey) {
    throw new Error(
      `Missing API key for AI provider "${config.provider}". Set GEMINI_API_KEY or OPENROUTER_API_KEY.`,
    );
  }
  if (!config.baseURL) {
    throw new Error(
      `Missing base URL for AI provider "${config.provider}". Set AI_CHAT_BASE_URL.`,
    );
  }

  const headers: Record<string, string> = {};
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER || "https://lockin.app";
    headers["X-Title"] = process.env.OPENROUTER_APP_TITLE || "Lock In";
  }

  return new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    defaultHeaders: Object.keys(headers).length > 0 ? headers : undefined,
    timeout: 45_000,
    maxRetries: 1,
  });
}

export type ChatJsonOptions = {
  temperature?: number;
  responseSchema?: Record<string, unknown>;
};

function looksLikeJson(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

async function completeJsonWithConfig(
  config: ChatConfig,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options: ChatJsonOptions = {},
): Promise<string> {
  const client = createChatClient(config);
  const temperature = options.temperature ?? 0.2;
  // Thinking models (3.5) can burn the whole budget on thoughts and return
  // empty / prose. Give them room, then reject non-JSON so we fall through.
  const maxTokens = 2048;
  const responseFormat = options.responseSchema
    ? ({
        type: "json_schema",
        json_schema: {
          name: "voice_todo_router",
          strict: false,
          schema: options.responseSchema,
        },
      } as OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"])
    : ({ type: "json_object" } as const);

  const attempts: Array<Partial<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming>> = [
    { response_format: responseFormat, max_tokens: maxTokens },
    { response_format: { type: "json_object" }, max_tokens: maxTokens },
    { max_tokens: maxTokens },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const response = await client.chat.completions.create({
        model: config.model,
        temperature,
        messages,
        ...attempt,
      });
      const raw = response.choices[0]?.message?.content?.trim() ?? "";
      if (!raw) {
        lastError = new Error("Empty LLM response");
        continue;
      }
      if (!looksLikeJson(raw)) {
        lastError = new Error(`Non-JSON LLM response: ${raw.slice(0, 80)}`);
        continue;
      }
      return raw;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Empty LLM response");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function geminiChatConfigs(base: ChatConfig): ChatConfig[] {
  const models = [base.model, ...GEMINI_CHAT_FALLBACKS];
  return [...new Set(models.filter(Boolean))].map((model) => ({ ...base, model }));
}

function openrouterChatConfigs(base: ChatConfig): ChatConfig[] {
  const models = [base.model, ...OPENROUTER_CHAT_FALLBACKS];
  return [...new Set(models.filter(Boolean))].map((model) => ({ ...base, model }));
}

export async function chatCompletionJson(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options: ChatJsonOptions = {},
): Promise<string> {
  const gemini = resolveGeminiConfig();
  const openrouter = resolveOpenRouterConfig();
  const errors: string[] = [];

  if (gemini) {
    for (const config of geminiChatConfigs(gemini)) {
      try {
        return await completeJsonWithConfig(config, messages, options);
      } catch (err) {
        errors.push(`gemini/${config.model}: ${errorMessage(err)}`);
      }
    }
  }

  if (openrouter) {
    for (const config of openrouterChatConfigs(openrouter)) {
      try {
        return await completeJsonWithConfig(config, messages, options);
      } catch (err) {
        errors.push(`openrouter/${config.model}: ${errorMessage(err)}`);
      }
    }
  }

  if (!gemini && !openrouter) {
    return completeJsonWithConfig(resolveChatConfig(), messages, options);
  }

  throw new Error(`LLM request failed (${errors.join("; ") || "no providers configured"})`);
}

export type ProviderProbe = {
  configured: boolean;
  ok: boolean;
  model?: string;
  error?: string;
};

/** Live one-token probe for ops/health — never logs the key. */
export async function probeChatProviders(): Promise<{
  gemini: ProviderProbe;
  openrouter: ProviderProbe;
  preferred: string;
}> {
  const geminiCfg = resolveGeminiConfig();
  const openrouterCfg = resolveOpenRouterConfig();
  const preferred = geminiCfg?.model || openrouterCfg?.model || "none";

  const gemini: ProviderProbe = { configured: Boolean(geminiCfg), ok: false };
  const openrouter: ProviderProbe = { configured: Boolean(openrouterCfg), ok: false };

  if (geminiCfg) {
    gemini.model = geminiCfg.model;
    try {
      const raw = await completeJsonWithConfig(
        { ...geminiCfg, model: geminiCfg.model || GEMINI_DEFAULTS.model },
        [
          { role: "system", content: "Return JSON only." },
          { role: "user", content: 'Reply with {"ok":true}' },
        ],
      );
      gemini.ok = looksLikeJson(raw);
      if (!gemini.ok) gemini.error = "Non-JSON response";
    } catch (err) {
      // Prefer a known-good fallback model for the probe so ops see if *any* Gemini works.
      try {
        const raw = await completeJsonWithConfig(
          { ...geminiCfg, model: "gemini-2.5-flash" },
          [
            { role: "system", content: "Return JSON only." },
            { role: "user", content: 'Reply with {"ok":true}' },
          ],
        );
        gemini.ok = looksLikeJson(raw);
        gemini.model = "gemini-2.5-flash";
        gemini.error = `preferred failed: ${errorMessage(err)}`;
      } catch (err2) {
        gemini.error = errorMessage(err2);
      }
    }
  }

  if (openrouterCfg) {
    openrouter.model = openrouterCfg.model;
    try {
      const raw = await completeJsonWithConfig(openrouterCfg, [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: 'Reply with {"ok":true}' },
      ]);
      openrouter.ok = looksLikeJson(raw);
      if (!openrouter.ok) openrouter.error = "Non-JSON response";
    } catch (err) {
      const message = errorMessage(err);
      openrouter.error = /402|insufficient credits/i.test(message)
        ? "Insufficient OpenRouter credits"
        : message;
    }
  }

  return { gemini, openrouter, preferred };
}
