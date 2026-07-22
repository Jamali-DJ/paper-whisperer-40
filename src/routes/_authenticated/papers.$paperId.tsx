import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";

import { deletePaper, getPaper, getSignedUrl } from "@/lib/papers";
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

  const {
    data: paper,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["papers", paperId],
    queryFn: () => getPaper(paperId),
    refetchInterval: (q) => (q.state.data?.status === "processing" ? 4000 : false),
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
      </header>

      {paper.status !== "ready" && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-muted-foreground">
            Analyzing your paper. This usually takes under a minute.
          </span>
        </div>
      )}

      <Tabs defaultValue="summary" className="w-full">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="flashcards">Flashcards</TabsTrigger>
          <TabsTrigger value="quiz">Quiz</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="mb-3 flex items-center gap-2 text-sm text-primary">
              <Sparkles className="h-4 w-4" /> AI summary
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {paper.summary ??
                "The AI summary will appear here once analysis is complete."}
            </p>
          </div>
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <ComingSoon
            title="Chat with this paper"
            body="Ask any question grounded in the source. AI wiring goes here."
          />
        </TabsContent>
        <TabsContent value="flashcards" className="mt-4">
          <ComingSoon
            title="Auto-generated flashcards"
            body="Key concepts turned into flip-cards for spaced repetition."
          />
        </TabsContent>
        <TabsContent value="quiz" className="mt-4">
          <ComingSoon
            title="Quiz yourself"
            body="Multiple-choice questions generated from the paper."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ComingSoon({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
      <div className="mx-auto grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
        <Sparkles className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <p className="mt-4 text-xs text-muted-foreground">Coming next.</p>
    </div>
  );
}