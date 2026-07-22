import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ExternalLink,
  FileText,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

import { deletePaper, getPaper, getSignedUrl } from "@/lib/papers";
import { processPaper } from "@/lib/papers.functions";
import type { KeyFinding, PaperReference } from "@/lib/pipeline/types";
import { PaperStatusStepper } from "@/components/paper-status-stepper";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/papers/$paperId")({
  head: () => ({
    meta: [
      { title: "Paper — Papyrus" },
      { name: "description", content: "Read the AI analysis of your paper." },
    ],
  }),
  component: PaperDetail,
});

function PaperDetail() {
  const { paperId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const runPipeline = useServerFn(processPaper);

  const {
    data: paper,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["papers", paperId],
    queryFn: () => getPaper(paperId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "uploading" || s === "extracting" || s === "analyzing" || s === "processing"
        ? 3000
        : false;
    },
  });

  useEffect(() => {
    if (paper?.file_path) getSignedUrl(paper.file_path).then(setPdfUrl).catch(() => {});
  }, [paper?.file_path]);

  if (isLoading) {
    return (
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !paper) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
        <p className="text-sm text-muted-foreground">This paper could not be loaded.</p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm text-primary">
          Back to dashboard
        </Link>
      </div>
    );
  }

  async function handleDelete() {
    if (!paper) return;
    try {
      await deletePaper(paper);
      qc.invalidateQueries({ queryKey: ["papers"] });
      toast.success("Paper deleted");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  async function handleRetry() {
    if (!paper) return;
    try {
      await runPipeline({ data: { paperId: paper.id } });
      qc.invalidateQueries({ queryKey: ["papers", paperId] });
      toast.success("Reprocessing started");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reprocess");
    }
  }

  const isDone = paper.status === "completed" || paper.status === "ready";
  const isFailed = paper.status === "failed";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Link>
        <div className="flex items-center gap-2">
          {isFailed && (
            <Button variant="outline" size="sm" onClick={handleRetry}>
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          )}
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="h-4 w-4" /> Open PDF
              </Button>
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{paper.title}</h1>
        {paper.authors && (
          <p className="mt-1 text-sm text-muted-foreground">{paper.authors}</p>
        )}
        {(paper.page_count || (paper.keywords && paper.keywords.length > 0)) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {paper.page_count && (
              <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5">
                <FileText className="h-3 w-3" /> {paper.page_count} pages
              </span>
            )}
            {paper.keywords?.slice(0, 6).map((k) => (
              <span
                key={k}
                className="rounded-full border border-border bg-card px-2 py-0.5"
              >
                {k}
              </span>
            ))}
          </div>
        )}
      </header>

      {!isDone && (
        <PaperStatusStepper status={paper.status} error={paper.error_message} />
      )}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="abstract">Abstract</TabsTrigger>
          <TabsTrigger value="findings">Key Findings</TabsTrigger>
          <TabsTrigger value="methodology">Methodology</TabsTrigger>
          <TabsTrigger value="conclusions">Conclusions</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <Section title="AI overview" loading={!isDone} failed={isFailed}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
              {paper.summary ?? "A concise AI-generated overview will appear here."}
            </p>
          </Section>
        </TabsContent>

        <TabsContent value="abstract" className="mt-4">
          <Section title="Abstract" loading={!isDone && !paper.abstract} failed={isFailed}>
            {paper.abstract ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                {paper.abstract}
              </p>
            ) : (
              <Empty message="No abstract was detected in this document." />
            )}
          </Section>
        </TabsContent>

        <TabsContent value="findings" className="mt-4">
          <Section title="Key findings" loading={!isDone} failed={isFailed}>
            <FindingsList findings={paper.key_findings} />
          </Section>
        </TabsContent>

        <TabsContent value="methodology" className="mt-4">
          <Section title="Methodology" loading={!isDone} failed={isFailed}>
            {paper.methodology ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                {paper.methodology}
              </p>
            ) : (
              <Empty message="Methodology section not detected." />
            )}
          </Section>
        </TabsContent>

        <TabsContent value="conclusions" className="mt-4">
          <Section title="Conclusions" loading={!isDone} failed={isFailed}>
            {paper.conclusions ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                {paper.conclusions}
              </p>
            ) : (
              <Empty message="Conclusions section not detected." />
            )}
          </Section>
        </TabsContent>

        <TabsContent value="references" className="mt-4">
          <Section title="References" loading={!isDone} failed={isFailed}>
            <ReferencesList references={paper.references} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Section({
  title,
  loading,
  failed,
  children,
}: {
  title: string;
  loading?: boolean;
  failed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-3 flex items-center gap-2 text-sm text-primary">
        <Sparkles className="h-4 w-4" /> {title}
      </div>
      {failed ? (
        <p className="text-sm text-destructive">
          This section could not be generated. Try reprocessing the paper.
        </p>
      ) : loading ? (
        <div className="space-y-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          <div className="h-3 w-full animate-pulse rounded bg-muted" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-muted" />
        </div>
      ) : (
        children
      )}
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>;
}

function FindingsList({ findings }: { findings: KeyFinding[] | null }) {
  if (!findings || findings.length === 0) {
    return <Empty message="No key findings were extracted for this paper." />;
  }
  return (
    <ul className="space-y-3">
      {findings.map((f, i) => (
        <li key={i} className="rounded-xl border border-border bg-background/40 p-4">
          <p className="text-sm font-medium text-foreground">{f.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{f.description}</p>
        </li>
      ))}
    </ul>
  );
}

function ReferencesList({ references }: { references: PaperReference[] | null }) {
  if (!references || references.length === 0) {
    return <Empty message="No references were detected in this document." />;
  }
  return (
    <ol className="space-y-2 text-sm">
      {references.map((r) => (
        <li key={r.index} className="flex gap-3 text-muted-foreground">
          <span className="w-6 shrink-0 text-right text-xs text-foreground/60">
            {r.index}.
          </span>
          <span className="leading-relaxed">{r.raw}</span>
        </li>
      ))}
    </ol>
  );
}