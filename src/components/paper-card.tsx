import { Link } from "@tanstack/react-router";
import { FileText, MoreVertical, Trash2, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import type { Paper } from "@/lib/papers";
import type { PaperStatus } from "@/lib/pipeline/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function StatusBadge({ status }: { status: Paper["status"] }) {
  const map: Record<PaperStatus, { cls: string; icon: React.ReactNode; label: string }> = {
    uploading: {
      cls: "bg-muted text-muted-foreground",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Uploading",
    },
    extracting: {
      cls: "bg-primary/15 text-primary",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Extracting",
    },
    analyzing: {
      cls: "bg-primary/15 text-primary",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Analyzing",
    },
    completed: {
      cls: "bg-emerald-500/15 text-emerald-400",
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "Completed",
    },
    processing: {
      cls: "bg-primary/15 text-primary",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: "Analyzing",
    },
    ready: {
      cls: "bg-emerald-500/15 text-emerald-400",
      icon: <CheckCircle2 className="h-3 w-3" />,
      label: "Ready",
    },
    failed: {
      cls: "bg-destructive/15 text-destructive",
      icon: <AlertCircle className="h-3 w-3" />,
      label: "Failed",
    },
  };
  const entry = map[status] ?? map.uploading;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${entry.cls}`}
    >
      {entry.icon}
      {entry.label}
    </span>
  );
}

export function PaperCard({
  paper,
  onDelete,
}: {
  paper: Paper;
  onDelete: (p: Paper) => void;
}) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <Link
          to="/papers/$paperId"
          params={{ paperId: paper.id }}
          className="flex min-w-0 flex-1 items-start gap-3"
        >
          <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-medium text-foreground">{paper.title}</h3>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {paper.summary ?? "Summary will appear here once analysis completes."}
            </p>
          </div>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Paper options">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onDelete(paper)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <StatusBadge status={paper.status} />
        <span>{formatDistanceToNow(new Date(paper.created_at), { addSuffix: true })}</span>
      </div>
    </div>
  );
}