// Provider-agnostic AI types. The UI never touches these directly — it goes
// through the server functions in `src/lib/analyses.functions.ts`, which in
// turn go through the AIService. Swapping providers is a config change, not a
// UI change.

export type AIRequest = {
  system: string;
  prompt: string;
  /** Soft cap on output tokens if the provider supports it. */
  maxTokens?: number;
};

export type AIResponse = {
  text: string;
  provider: string;
  model: string;
};

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  generate(req: AIRequest): Promise<AIResponse>;
}

export type AIProviderKind = "lovable" | "openai" | "anthropic" | "gemini" | "local";

export type AIProviderConfig = {
  kind: AIProviderKind;
  /** Model id (provider-specific). Falls back to a sensible default per kind. */
  model?: string;
  /** Optional override; defaults to env-based key resolution. */
  apiKey?: string;
  /** Optional base URL (used by `openai`, `local`). */
  baseUrl?: string;
};