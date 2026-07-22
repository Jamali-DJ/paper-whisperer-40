import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { FileText, Search } from "lucide-react";

import { listPapers, deletePaper, type Paper } from "@/lib/papers";
import { PaperCard } from "@/components/paper-card";
import { PaperUploader } from "@/components/paper-uploader";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Papyrus" },
      { name: "description", content: "Your uploaded papers and analysis." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const { data: papers = [], isLoading } = useQuery({
    queryKey: ["papers"],
    queryFn: listPapers,
  });

  async function handleDelete(paper: Paper) {
    try {
      await deletePaper(paper);
      toast.success("Paper deleted");
      qc.invalidateQueries({ queryKey: ["papers"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  const filtered = papers.filter((p) =>
    p.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-8">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">
            Your papers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload PDFs and let AI turn them into simple summaries.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56 pl-8"
          />
        </div>
      </header>

      <PaperUploader onUploaded={() => qc.invalidateQueries({ queryKey: ["papers"] })} />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl border border-border bg-card/60" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-12 text-center">
          <div className="mx-auto grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <FileText className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm font-medium">No papers yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your first PDF above to get started.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <PaperCard key={p.id} paper={p} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}