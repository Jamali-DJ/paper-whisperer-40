// Streaming RAG chat endpoint. Validates the caller's Supabase JWT, kicks off
// RAG retrieval + AI SDK streaming, and persists both the user question and
// the final assistant answer.
import { createFileRoute } from "@tanstack/react-router";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UIMessage } from "ai";

import type { Database } from "@/integrations/supabase/types";

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buildAuthedSupabase(token: string): SupabaseClient {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const isNewKey = key.startsWith("sb_publishable_") || key.startsWith("sb_secret_");
  return createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (isNewKey && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  }) as unknown as SupabaseClient;
}

type ChatBody = {
  messages?: UIMessage[];
  paperId?: string;
  conversationId?: string;
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const authHeader = request.headers.get("authorization");
          if (!authHeader?.startsWith("Bearer ")) return jsonError(401, "Missing bearer token");
          const token = authHeader.slice("Bearer ".length);
          if (token.split(".").length !== 3) return jsonError(401, "Invalid token");

          const supabase = buildAuthedSupabase(token);
          const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
          if (claimsErr || !claims?.claims?.sub) return jsonError(401, "Invalid session");
          const userId = claims.claims.sub;

          const body = (await request.json()) as ChatBody;
          const { paperId, conversationId, messages } = body;
          if (!paperId || !conversationId || !Array.isArray(messages)) {
            return jsonError(400, "paperId, conversationId, and messages are required");
          }

          // Verify conversation belongs to caller + paper (RLS enforces user_id).
          const { data: conv, error: convErr } = await supabase
            .from("chat_conversations")
            .select("id, paper_id, user_id")
            .eq("id", conversationId)
            .maybeSingle();
          if (convErr) return jsonError(500, convErr.message);
          if (!conv || conv.paper_id !== paperId || conv.user_id !== userId) {
            return jsonError(403, "Conversation not accessible");
          }

          const {
            streamRAGChat,
            persistUserMessage,
            persistAssistantMessage,
          } = await import("@/lib/rag/chat.server");

          // Persist just the newest user message (client already has the rest).
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          if (lastUser) {
            const text = lastUser.parts
              .map((p) => (p.type === "text" ? p.text : ""))
              .join("")
              .trim();
            if (text) {
              void persistUserMessage({
                supabase,
                userId,
                conversationId,
                content: text,
              });
            }
          }

          const { result, citations, provider, model } = await streamRAGChat({
            supabase,
            userId,
            paperId,
            conversationId,
            messages,
            abortSignal: request.signal,
          });

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            messageMetadata: () => ({ citations, provider, model }),
            onFinish: async ({ responseMessage, isAborted }) => {
              if (isAborted) return;
              const content = (responseMessage.parts ?? [])
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("")
                .trim();
              if (!content) return;
              await persistAssistantMessage({
                supabase,
                userId,
                conversationId,
                content,
                citations,
                provider,
                model,
              });
            },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Chat failed";
          console.error("[api/chat]", err);
          return jsonError(500, message);
        }
      },
    },
  },
});