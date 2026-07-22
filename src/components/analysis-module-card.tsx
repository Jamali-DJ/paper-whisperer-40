import { useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BookOpen,
  ChevronDown,
  Compass,
  Copy,
  Download,
  FlaskConical,
  Loader2,
  Microscope,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  Type,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AnalysisModuleDef } from "@/lib/ai/modules";
import type { AnalysisStatus, PaperAnalysisRow } from "@/lib/analyses";

const ICONS: Record<AnalysisModuleDef["icon"], typeof Sparkles> = {
  sparkles: Sparkles,
  book: BookOpen,
  flask: FlaskConical,
  target: Target,
  microscope: Microscope,
  trophy: Trophy,
  alert: AlertTriangle,
  compass: Compass,
  glossary: Type,
};

type Props = {
  module: AnalysisModuleDef;
  row: PaperAnalysisRow | null;
  paperTitle: string;
  onRegenerate: () => Promise<void> | void;
  regenerating: boolean;
  defaultOpen?: boolean;
};

function download(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function safeFilename(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "paper";
}

function StatusPill({ status }: { status: AnalysisStatus | "idle" }) {
  const map: Record<string, { label: string; className: string }> = {
    idle: { label: "Not generated", className: "text-muted-foreground border-border" },
    pending: { label: "Queued", className: "text-muted-foreground border-border" },
    generating: { label: "Generating", className: "text-primary border-primary/40" },
    completed: { label: "Ready", className: "text-emerald-400 border-emerald-500/30" },
    failed: { label: "Failed", className: "text-destructive border-destructive/40" },
  };
  const s = map[status] ?? map.idle;
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide",
        s.className,
      )}
    >
      {s.label}
    </span>
  );
}

function inline(s: string) {
  return s
    .replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-xs">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function MarkdownBody({ markdown }: { markdown: string }) {
  const lines = markdown.split(/\r?\n/);
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (list.length === 0) return;
    out.push(
      <ul key={`ul-${out.length}`} className="my-2 list-disc space-y-1 pl-5 text-sm text-foreground/90">
        {list.map((item, i) => (
          <li key={i} dangerouslySetInnerHTML={{ __html: inline(item) }} />
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const cls =
        level === 1
          ? "mt-3 text-lg font-semibold"
          : level === 2
            ? "mt-3 text-base font-semibold"
            : "mt-3 text-sm font-semibold";
      out.push(
        <p key={`h-${out.length}`} className={cls} dangerouslySetInnerHTML={{ __html: inline(h[2]) }} />,
      );
      continue;
    }
    out.push(
      <p
        key={`p-${out.length}`}
        className="text-sm leading-relaxed text-foreground/90"
        dangerouslySetInnerHTML={{ __html: inline(line) }}
      />,
    );
  }
  flushList();
  return <div className="space-y-2">{out}</div>;
}

export function AnalysisModuleCard({
  module,
  row,
  paperTitle,
  onRegenerate,
  regenerating,
  defaultOpen,
}: Props) {
  const Icon = ICONS[module.icon] ?? Sparkles;
  const status: AnalysisStatus | "idle" = row?.status ?? "idle";
  const isBusy = status === "generating" || status === "pending" || regenerating;
  const isDone = status === "completed" && !!row?.content?.markdown;
  const isFailed = status === "failed";
  const [open, setOpen] = useState(defaultOpen ?? false);

  const markdown = row?.content?.markdown ?? "";

  async function handleCopy() {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  }

  function handleExport() {
    if (!markdown) return;
    const filename = `${safeFilename(paperTitle)}-${safeFilename(module.title)}.md`;
    download(filename, `# ${module.title}\n\n${markdown}\n`);
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="overflow-hidden rounded-2xl border border-border bg-card/60 transition-colors">
        <div className="flex items-center gap-3 p-4">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <CollapsibleTrigger asChild>
            <button className="flex flex-1 items-center justify-between text-left">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground">{module.title}</p>
                  <StatusPill status={status} />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{module.description}</p>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  open && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
        </div>

        <CollapsibleContent>
          <div className="border-t border-border px-5 pb-5 pt-4">
            {isBusy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating with AI…
              </div>
            ) : isFailed ? (
              <p className="text-sm text-destructive">
                {row?.error_message ?? "This module failed to generate."}
              </p>
            ) : isDone ? (
              <MarkdownBody markdown={markdown} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Not generated yet. Run it to get an AI-authored {module.title.toLowerCase()}.
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] text-muted-foreground">
                {row?.provider && row?.model
                  ? `via ${row.provider} • ${row.model}`
                  : "AI service ready"}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!isDone}>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={handleExport} disabled={!isDone}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRegenerate()}
                  disabled={regenerating || status === "generating"}
                >
                  {regenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {isDone || isFailed ? "Regenerate" : "Generate"}
                </Button>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}