// AIService — the single seam between the paper pipeline and any AI backend.
// Server-only: never import from client code.
//
// Adding a new provider = implement `AIProvider` and register it in
// `createProvider`. UI, DB shape, and callers stay untouched.
import type {
  AIProvider,
  AIProviderConfig,
  AIProviderKind,
  AIRequest,
  AIResponse,
} from "./types";

const DEFAULT_MODEL_BY_KIND: Record<AIProviderKind, string> = {
  lovable: "google/gemini-2.5-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-latest",
  gemini: "gemini-2.5-flash",
  local: "llama3",
};

function resolveConfig(): AIProviderConfig {
  const kind = (process.env.AI_PROVIDER as AIProviderKind | undefined) ?? "lovable";
  return {
    kind,
    model: process.env.AI_MODEL ?? DEFAULT_MODEL_BY_KIND[kind],
    apiKey: process.env.AI_API_KEY,
    baseUrl: process.env.AI_BASE_URL,
  };
}

async function openAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  req: AIRequest,
  extraHeaders: Record<string, string> = {},
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.prompt },
      ],
      max_tokens: req.maxTokens,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429) throw new Error("AI rate limit hit. Try again in a moment.");
    if (res.status === 402) throw new Error("AI credits exhausted for this workspace.");
    throw new Error(`AI provider ${res.status}: ${body || res.statusText}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = json.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("AI provider returned an empty response.");
  return text;
}

async function anthropicMessages(
  apiKey: string,
  model: string,
  req: AIRequest,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: req.system,
      max_tokens: req.maxTokens ?? 1024,
      messages: [{ role: "user", content: req.prompt }],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${body || res.statusText}`);
  }
  const json = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const text = json.content?.find((c) => c.type === "text")?.text?.trim();
  if (!text) throw new Error("Anthropic returned an empty response.");
  return text;
}

function createProvider(config: AIProviderConfig): AIProvider {
  const model = config.model ?? DEFAULT_MODEL_BY_KIND[config.kind];
  switch (config.kind) {
    case "lovable": {
      const key = config.apiKey ?? process.env.LOVABLE_API_KEY;
      if (!key) throw new Error("Missing LOVABLE_API_KEY for AI provider.");
      return {
        name: "lovable",
        model,
        async generate(req) {
          const text = await openAICompatible(
            "https://ai.gateway.lovable.dev/v1",
            key,
            model,
            req,
          );
          return { text, provider: "lovable", model };
        },
      };
    }
    case "openai": {
      const key = config.apiKey ?? process.env.OPENAI_API_KEY;
      if (!key) throw new Error("Missing OPENAI_API_KEY for AI provider.");
      const base = config.baseUrl ?? "https://api.openai.com/v1";
      return {
        name: "openai",
        model,
        async generate(req) {
          const text = await openAICompatible(base, key, model, req);
          return { text, provider: "openai", model };
        },
      };
    }
    case "anthropic": {
      const key = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error("Missing ANTHROPIC_API_KEY for AI provider.");
      return {
        name: "anthropic",
        model,
        async generate(req) {
          const text = await anthropicMessages(key, model, req);
          return { text, provider: "anthropic", model };
        },
      };
    }
    case "gemini": {
      const key = config.apiKey ?? process.env.LOVABLE_API_KEY;
      if (!key) throw new Error("Missing LOVABLE_API_KEY for Gemini via gateway.");
      const gModel = model.startsWith("google/") ? model : `google/${model}`;
      return {
        name: "gemini",
        model: gModel,
        async generate(req) {
          const text = await openAICompatible(
            "https://ai.gateway.lovable.dev/v1",
            key,
            gModel,
            req,
          );
          return { text, provider: "gemini", model: gModel };
        },
      };
    }
    case "local": {
      const base = config.baseUrl ?? "http://localhost:11434/v1";
      const key = config.apiKey ?? "local";
      return {
        name: "local",
        model,
        async generate(req) {
          const text = await openAICompatible(base, key, model, req);
          return { text, provider: "local", model };
        },
      };
    }
  }
}

let cached: { config: AIProviderConfig; provider: AIProvider } | null = null;

export function getAIService(override?: Partial<AIProviderConfig>): AIProvider {
  const config = { ...resolveConfig(), ...override };
  if (
    cached &&
    cached.config.kind === config.kind &&
    cached.config.model === config.model &&
    cached.config.baseUrl === config.baseUrl
  ) {
    return cached.provider;
  }
  const provider = createProvider(config);
  cached = { config, provider };
  return provider;
}

export type { AIProvider, AIRequest, AIResponse };