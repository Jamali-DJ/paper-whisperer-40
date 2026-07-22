import { useCallback, useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { uploadPaper } from "@/lib/papers";
import { useServerFn } from "@tanstack/react-start";
import { processPaper } from "@/lib/papers.functions";

export function PaperUploader({ onUploaded }: { onUploaded: () => void }) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const runPipeline = useServerFn(processPaper);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) =>
        f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
      );
      if (list.length === 0) {
        toast.error("Only PDF files are supported for now.");
        return;
      }
      setBusy(true);
      try {
        for (const f of list) {
          if (f.size > 25 * 1024 * 1024) {
            toast.error(`${f.name} is over 25 MB.`);
            continue;
          }
          const paper = await uploadPaper(f);
          toast.success(`${f.name} uploaded — analysis started.`);
          // Fire-and-forget: the pipeline updates the row in place; the
          // dashboard/detail views poll for status changes.
          runPipeline({ data: { paperId: paper.id } }).catch((err) => {
            const message = err instanceof Error ? err.message : "Analysis failed";
            toast.error(`${f.name}: ${message}`);
          });
        }
        onUploaded();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [onUploaded, runPipeline],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (e.dataTransfer.files) handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center transition-colors",
        dragOver && "border-primary/60 bg-primary/5",
      )}
    >
      <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/15 text-primary">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
      </div>
      <div>
        <p className="text-sm font-medium">
          {busy ? "Uploading…" : "Drop a PDF here to analyze"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          or{" "}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="text-primary underline-offset-4 hover:underline"
            disabled={busy}
          >
            browse from your computer
          </button>
          . PDF up to 25 MB.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
    </div>
  );
}