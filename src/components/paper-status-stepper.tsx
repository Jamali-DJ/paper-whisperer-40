import { Check, Loader2, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { PIPELINE_STAGES, STAGE_LABELS, type PaperStatus } from "@/lib/pipeline/types";

function normalize(status: PaperStatus): PaperStatus {
  if (status === "processing") return "analyzing";
  if (status === "ready") return "completed";
  return status;
}

export function PaperStatusStepper({
  status,
  error,
}: {
  status: PaperStatus;
  error?: string | null;
}) {
  const current = normalize(status);
  const currentIndex = PIPELINE_STAGES.indexOf(current);
  const failed = status === "failed";

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-5">
      <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2">
        {PIPELINE_STAGES.map((stage, i) => {
          const isDone = !failed && i < currentIndex;
          const isActive = !failed && i === currentIndex && current !== "completed";
          const isComplete = !failed && current === "completed";
          return (
            <li key={stage} className="flex flex-1 items-center gap-2">
              <div
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs",
                  isDone || isComplete
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                    : isActive
                      ? "border-primary/60 bg-primary/15 text-primary"
                      : "border-border bg-background text-muted-foreground",
                )}
              >
                {isDone || (isComplete && i === PIPELINE_STAGES.length - 1) ? (
                  <Check className="h-3.5 w-3.5" />
                ) : isActive ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <span>{i + 1}</span>
                )}
              </div>
              <span
                className={cn(
                  "text-xs",
                  isActive
                    ? "text-foreground"
                    : isDone || isComplete
                      ? "text-foreground/80"
                      : "text-muted-foreground",
                )}
              >
                {STAGE_LABELS[stage]}
              </span>
              {i < PIPELINE_STAGES.length - 1 && (
                <div className="hidden h-px flex-1 bg-border sm:block" />
              )}
            </li>
          );
        })}
      </ol>
      {failed && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error ?? "Processing failed. Please try uploading again."}</span>
        </div>
      )}
    </div>
  );
}