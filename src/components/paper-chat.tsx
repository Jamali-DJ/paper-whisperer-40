// Chat with Paper — RAG-powered conversation UI. The component never talks to
// an LLM directly; it streams from `/api/chat`, which runs the ChatService.
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Check,
  Copy,
  Loader2,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { ensurePaperIndexed } from "@/lib/chat.functions";
import {
  createConversation,
  deleteConversation,
  listConversations,
  listMessages,
  SUGGESTED_QUESTIONS,
  type ChatConversation,
  type ChatMessage as StoredChatMessage,
} from "@/lib/chat";
import { citationLabel } from "@/lib/rag/citations";
import type { Citation } from "@/lib/rag/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  paperId: string;
  paperTitle: string;
  ready: boolean;
};

type ChatUIMessage = UIMessage<{ citations?: Citation[]; model?: string; provider?: string }>;

function storedToUIMessage(m: StoredChatMessage): ChatUIMessage {
  return {
    id: m.id,
    role: m.role,
    parts: [{ type: "text", text: m.content }],
    metadata: m.citations ? { citations: m.citations } : undefined,
  } as ChatUIMessage;
}

function messageText(m: ChatUIMessage): string {
  return (m.parts ?? [])
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("");
}

function messageCitations(m: ChatUIMessage): Citation[] {
  return (m.metadata?.citations as Citation[] | undefined) ?? [];
}

export function PaperChat({ paperId, paperTitle, ready }: Props) {
  const qc = useQueryClient();
  const ensureIndexed = useServerFn(ensurePaperIndexed);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Kick off indexing when the paper is ready. Idempotent server-side.
  useEffect(() => {
    if (!ready) return;
    ensureIndexed({ data: { paperId } }).catch((err) => {
      console.error("[chat] index paper failed", err);
    });
  }, [ready, paperId, ensureIndexed]);

  const { data: conversations } = useQuery({
    queryKey: ["chat", paperId, "conversations"],
    queryFn: () => listConversations(paperId),
    enabled: ready,
  });

  // Auto-select or create a conversation.
  useEffect(() => {
    if (!ready) return;
    if (activeConvId) return;
    if (!conversations) return;
    if (conversations.length > 0) {
      setActiveConvId(conversations[0].id);
    } else {
      createConversation(paperId, "New conversation")
        .then((c) => {
          setActiveConvId(c.id);
          qc.invalidateQueries({ queryKey: ["chat", paperId, "conversations"] });
        })
        .catch((err) => toast.error(err.message ?? "Failed to start chat"));
    }
  }, [ready, conversations, activeConvId, paperId, qc]);

  const { data: initialMessages } = useQuery({
    queryKey: ["chat", "messages", activeConvId],
    queryFn: () => (activeConvId ? listMessages(activeConvId) : Promise.resolve([])),
    enabled: !!activeConvId,
  });

  const initialUIMessages = useMemo<ChatUIMessage[]>(
    () => (initialMessages ?? []).map(storedToUIMessage),
    [initialMessages],
  );

  // Custom fetch attaches the Supabase bearer to /api/chat.
  const authedFetch = useCallback<typeof fetch>(async (input, init) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: authedFetch,
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: {
            messages,
            paperId,
            conversationId: activeConvId,
            ...(body ?? {}),
          },
        }),
      }),
    [authedFetch, paperId, activeConvId],
  );

  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    regenerate,
    setMessages,
  } = useChat<ChatUIMessage>({
    id: activeConvId ?? undefined,
    messages: initialUIMessages,
    transport,
    onError: (e) => toast.error(e.message),
    onFinish: () => {
      qc.invalidateQueries({ queryKey: ["chat", "messages", activeConvId] });
      qc.invalidateQueries({ queryKey: ["chat", paperId, "conversations"] });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  const isStreaming = status === "submitted" || status === "streaming";

  async function handleSend(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !activeConvId || isStreaming) return;
    setInput("");
    await sendMessage({ text: trimmed });
  }

  async function handleNewConversation() {
    try {
      const c = await createConversation(paperId, "New conversation");
      setActiveConvId(c.id);
      setMessages([]);
      qc.invalidateQueries({ queryKey: ["chat", paperId, "conversations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create conversation");
    }
  }

  async function handleDeleteConversation(id: string) {
    try {
      await deleteConversation(id);
      if (id === activeConvId) {
        setActiveConvId(null);
        setMessages([]);
      }
      qc.invalidateQueries({ queryKey: ["chat", paperId, "conversations"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete conversation");
    }
  }

  const showEmpty = !isStreaming && messages.length === 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <ConversationList
        conversations={conversations ?? []}
        activeId={activeConvId}
        onSelect={(id) => setActiveConvId(id)}
        onCreate={handleNewConversation}
        onDelete={handleDeleteConversation}
      />
      <div className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-card/60">
        <header className="flex items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">Chat with paper</p>
            <p className="truncate text-xs text-muted-foreground">{paperTitle}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMessages([])}
            disabled={messages.length === 0 || isStreaming}
          >
            <Trash2 className="h-4 w-4" /> Clear view
          </Button>
        </header>

        <div ref={scrollRef} className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
          {!ready && (
            <EmptyBanner
              title="Paper is still processing"
              description="Chat unlocks as soon as text extraction completes."
            />
          )}

          {ready && showEmpty && (
            <EmptyState onPick={(q) => handleSend(q)} />
          )}

          {messages.map((m, i) => (
            <MessageBubble
              key={m.id}
              message={m}
              isLast={i === messages.length - 1}
              streaming={isStreaming && i === messages.length - 1 && m.role === "assistant"}
              onRegenerate={
                i === messages.length - 1 && m.role === "assistant" && !isStreaming
                  ? () => regenerate()
                  : undefined
              }
            />
          ))}

          {isStreaming && messages[messages.length - 1]?.role === "user" && (
            <ThinkingIndicator />
          )}

          {error && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error.message}
            </div>
          )}
        </div>

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => handleSend(input)}
          onStop={stop}
          disabled={!ready || !activeConvId}
          isStreaming={isStreaming}
        />
      </div>
    </div>
  );
}

function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
}: {
  conversations: ChatConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <aside className="hidden max-h-[560px] flex-col gap-2 overflow-y-auto rounded-2xl border border-border bg-card/40 p-2 lg:flex">
      <Button variant="outline" size="sm" onClick={onCreate} className="justify-start">
        <Plus className="h-4 w-4" /> New conversation
      </Button>
      <div className="mt-1 space-y-1">
        {conversations.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No conversations yet.</p>
        )}
        {conversations.map((c) => (
          <div
            key={c.id}
            className={cn(
              "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs transition",
              activeId === c.id
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground hover:bg-muted/40",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className="min-w-0 flex-1 truncate text-left"
            >
              {c.title || "Untitled"}
            </button>
            <button
              type="button"
              onClick={() => onDelete(c.id)}
              className="opacity-0 transition group-hover:opacity-100"
              aria-label="Delete conversation"
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">Ask anything about this paper</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Answers are grounded in the paper text and cited by page.
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {SUGGESTED_QUESTIONS.slice(0, 6).map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-xl border border-border bg-card/60 px-3 py-2.5 text-left text-sm text-foreground/90 transition hover:border-primary/40 hover:bg-primary/5"
          >
            <MessageSquarePlus className="mr-2 inline-block h-4 w-4 text-primary/80" />
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function EmptyBanner({ title, description }: { title: string; description: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-background/40 p-4 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      Thinking…
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
  onRegenerate,
}: {
  message: ChatUIMessage;
  isLast: boolean;
  streaming: boolean;
  onRegenerate?: () => void;
}) {
  const isUser = message.role === "user";
  const text = messageText(message);
  const citations = messageCitations(message);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <div className={cn("flex flex-col gap-1.5", isUser ? "items-end" : "items-start")}> 
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card text-foreground/95 border border-border/60",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <MarkdownBody text={text} citations={citations} streaming={streaming} />
        )}
      </div>
      {!isUser && text && (
        <div className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
          <button type="button" onClick={copy} className="inline-flex items-center gap-1 hover:text-foreground">
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
          {onRegenerate && (
            <button type="button" onClick={onRegenerate} className="inline-flex items-center gap-1 hover:text-foreground">
              <RefreshCw className="h-3 w-3" /> Regenerate
            </button>
          )}
        </div>
      )}
      {!isUser && citations.length > 0 && <CitationList citations={citations} />}
    </div>
  );
}

function MarkdownBody({
  text,
  citations,
  streaming,
}: {
  text: string;
  citations: Citation[];
  streaming: boolean;
}) {
  // Turn "[3]" into a superscript link when a matching citation exists.
  const rendered = useMemo(() => {
    if (citations.length === 0) return text;
    return text.replace(/\[(\d+)\]/g, (m, n) => {
      const idx = Number(n);
      const found = citations.find((c) => c.index === idx);
      return found ? ` [^${idx}]` : m;
    });
  }, [text, citations]);

  return (
    <div className="prose prose-sm prose-invert max-w-none prose-p:my-2 prose-pre:my-2 prose-headings:mt-4 prose-headings:mb-2 prose-code:before:content-none prose-code:after:content-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: (props) => <a {...props} className="text-primary underline-offset-2 hover:underline" />,
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto">
              <table {...props} className="w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
        }}
      >
        {rendered}
      </ReactMarkdown>
      {streaming && (
        <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-primary/70 align-middle" />
      )}
    </div>
  );
}

function CitationList({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 pl-1">
      {citations.map((c) => (
        <span
          key={c.index}
          title={c.snippet}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          <span className="text-primary">[{c.index}]</span> {citationLabel(c)}
        </span>
      ))}
    </div>
  );
}

function Composer({
  value,
  onChange,
  onSend,
  onStop,
  disabled,
  isStreaming,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onStop: () => void;
  disabled: boolean;
  isStreaming: boolean;
}) {
  return (
    <div className="border-t border-border/60 bg-background/60 p-3">
      <div className="flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:ring-1 focus-within:ring-primary/40">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={disabled ? "Preparing chat…" : "Ask a question about this paper…"}
          rows={1}
          disabled={disabled}
          className="min-h-[36px] max-h-40 flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
        />
        {isStreaming ? (
          <Button type="button" size="sm" variant="ghost" onClick={onStop}>
            <Square className="h-4 w-4" /> Stop
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={onSend}
            disabled={disabled || value.trim().length === 0}
          >
            {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        )}
      </div>
      <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
        Answers cite the paper by page. AI can make mistakes — verify important claims.
      </p>
    </div>
  );
}