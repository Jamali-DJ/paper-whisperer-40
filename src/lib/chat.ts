// Client-side chat data layer.
import { supabase } from "@/integrations/supabase/client";
import type { Citation } from "@/lib/rag/types";

export type ChatConversation = {
  id: string;
  paper_id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations: Citation[] | null;
  provider: string | null;
  model: string | null;
  created_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: string) => any };

export async function listConversations(paperId: string): Promise<ChatConversation[]> {
  const { data, error } = await db
    .from("chat_conversations")
    .select("*")
    .eq("paper_id", paperId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChatConversation[];
}

export async function createConversation(paperId: string, title = "New conversation"): Promise<ChatConversation> {
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes.user) throw userErr ?? new Error("Not signed in");
  const { data, error } = await db
    .from("chat_conversations")
    .insert({ paper_id: paperId, user_id: userRes.user.id, title })
    .select()
    .single();
  if (error) throw error;
  return data as ChatConversation;
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await db.from("chat_conversations").delete().eq("id", id);
  if (error) throw error;
}

export async function renameConversation(id: string, title: string): Promise<void> {
  const { error } = await db.from("chat_conversations").update({ title }).eq("id", id);
  if (error) throw error;
}

export async function listMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from("chat_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ChatMessage[];
}

export async function deleteMessagesFor(conversationId: string): Promise<void> {
  const { error } = await db.from("chat_messages").delete().eq("conversation_id", conversationId);
  if (error) throw error;
}

export const SUGGESTED_QUESTIONS: string[] = [
  "Summarize this paper in one paragraph.",
  "Explain it like I'm 15.",
  "What problem is being solved and why does it matter?",
  "What are the key findings, with numbers?",
  "Explain the methodology in simple English.",
  "What are the main limitations?",
  "Suggest 3 follow-up research directions.",
];