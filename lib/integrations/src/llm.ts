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
  model: "google/gemini-2.0-flash-001",
} as const;

const GEMINI_DEFAULTS = {
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  model: "gemini-2.0-flash",
} as const;

function parseProvider(raw: string | undefined): ChatProvider {
  const value = raw?.toLowerCase();
  if (value === "openrouter" || value === "gemini" || value === "custom") {
    return value;
  }
  return "openrouter";
}

export function resolveChatConfig(): ChatConfig {
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
      `Missing API key for AI provider "${config.provider}". Set AI_CHAT_API_KEY or the provider-specific key.`,
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

export async function chatCompletionJson(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Promise<string> {
  const config = resolveChatConfig();
  const client = createChatClient(config);

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
}
