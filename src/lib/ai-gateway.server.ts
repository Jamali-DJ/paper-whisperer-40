// Provider factory for AI SDK v7 pointing at the Lovable AI Gateway.
// Server-only.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export function createLovableAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}

export const DEFAULT_CHAT_MODEL = "google/gemini-2.5-flash";