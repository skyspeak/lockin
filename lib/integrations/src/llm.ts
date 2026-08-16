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
  model: "google/gemini-3.5-flash",
} as const;

const GEMINI_DEFAULTS = {
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  model: "gemini-3.5-flash",
} as const;

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
    if (process.env.OPENROUTER_HTTP_REFERER) {
      headers["HTTP-Referer"] = process.env.OPENROUTER_HTTP_REFERER;
    }
    if (process.env.OPENROUTER_APP_TITLE) {
      headers["X-Title"] = process.env.OPENROUTER_APP_TITLE;
    }
  }

  return new OpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    defaultHeaders: Object.keys(headers).length > 0 ? headers : undefined,
  });
}

async function completeJsonWithConfig(
  config: ChatConfig,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<string> {
  const client = createChatClient(config);
  try {
    const response = await client.chat.completions.create({
      model: config.model,
      response_format: { type: "json_object" },
      messages,
    });
    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("Empty LLM response");
    }
    return raw;
  } catch (err) {
    const response = await client.chat.completions.create({
      model: config.model,
      messages,
    });
    const raw = response.choices[0]?.message?.content;
    if (!raw) {
      throw err instanceof Error ? err : new Error("Empty LLM response");
    }
    return raw;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function chatCompletionJson(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<string> {
  const gemini = resolveGeminiConfig();
  const openrouter = resolveOpenRouterConfig();
  const errors: string[] = [];

  if (gemini) {
    try {
      return await completeJsonWithConfig(gemini, messages);
    } catch (err) {
      errors.push(`gemini: ${errorMessage(err)}`);
    }
  }

  if (openrouter) {
    try {
      return await completeJsonWithConfig(openrouter, messages);
    } catch (err) {
      errors.push(`openrouter: ${errorMessage(err)}`);
    }
  }

  if (!gemini && !openrouter) {
    return completeJsonWithConfig(resolveChatConfig(), messages);
  }

  throw new Error(`LLM request failed (${errors.join("; ") || "no providers configured"})`);
}
