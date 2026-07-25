// ChatService — the single seam between the chat UI transport and the RAG
// pipeline. Retrieval, prompt building, model call, and citation formatting
// live in separate modules; this file wires them together and streams tokens.
import type { SupabaseClient } from "@supabase/supabase-js";
import { streamText, convertToModelMessages, type UIMessage } from "ai";

import { createLovableAiGatewayProvider, DEFAULT_CHAT_MODEL } from "@/lib/ai-gateway.server";
import { DefaultChunkRetriever } from "./retriever.server";
import { buildChatPrompt } from "./prompt.server";
import type { Citation } from "./types";

export type ChatStreamInput = {
  supabase: SupabaseClient;
  userId: string;
  paperId: string;
  conversationId: string;
  messages: UIMessage[];
  abortSignal?: AbortSignal;
};

async function loadPaperHeader(supabase: SupabaseClient, paperId: string, userId: string) {
  const { data, error } = await supabase
    .from("papers")
    .select("id, user_id, title, authors, extracted_text")
    .eq("id", paperId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Paper not found");
  if (data.user_id !== userId) throw new Error("Forbidden");
  if (!data.extracted_text) throw new Error("Paper is still being processed. Try again in a moment.");
  return data as { id: string; title: string | null; authors: string | null };
}

function latestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").trim();
    if (text) return text;
  }
  return "";
}

export async function streamRAGChat(input: ChatStreamInput) {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  const paper = await loadPaperHeader(input.supabase, input.paperId, input.userId);
  const query = latestUserText(input.messages);
  if (!query) throw new Error("Empty user question");

  const retriever = new DefaultChunkRetriever(input.supabase);
  const retrieved = await retriever.retrieve({
    paperId: input.paperId,
    userId: input.userId,
    query,
    topK: 8,
  });

  const { systemMessage, citations } = buildChatPrompt({
    paperTitle: paper.title,
    paperAuthors: paper.authors,
    retrieved,
  });

  const gateway = createLovableAiGatewayProvider(key);
  const model = gateway(DEFAULT_CHAT_MODEL);
  const result = streamText({
    model,
    system: systemMessage,
    messages: await convertToModelMessages(input.messages),
    abortSignal: input.abortSignal,
  });

  return { result, citations, model: DEFAULT_CHAT_MODEL, provider: "lovable" as const };
}

export async function persistUserMessage(input: {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string;
  content: string;
}) {
  const { error } = await input.supabase.from("chat_messages").insert({
    conversation_id: input.conversationId,
    user_id: input.userId,
    role: "user",
    content: input.content,
  });
  if (error) console.error("[chat] persist user failed", error);
}

export async function persistAssistantMessage(input: {
  supabase: SupabaseClient;
  userId: string;
  conversationId: string;
  content: string;
  citations: Citation[];
  provider: string;
  model: string;
}) {
  const { error } = await input.supabase.from("chat_messages").insert({
    conversation_id: input.conversationId,
    user_id: input.userId,
    role: "assistant",
    content: input.content,
    citations: input.citations,
    provider: input.provider,
    model: input.model,
  });
  if (error) console.error("[chat] persist assistant failed", error);
  await input.supabase
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.conversationId);
}