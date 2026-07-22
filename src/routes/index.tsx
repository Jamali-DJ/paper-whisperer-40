import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, FileText, MessageSquare, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Papyrus — Understand any research paper in minutes" },
      {
        name: "description",
        content:
          "Upload a PDF. Get a plain-English summary, key findings, flashcards, and a chat that has read the whole paper.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div
      className="relative min-h-screen bg-background text-foreground"
      style={{ backgroundImage: "var(--gradient-hero)" }}
    >
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          Papyrus
        </Link>
        <nav className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link to="/auth">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            AI research assistant
          </div>
          <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Understand any research paper
            <span className="block bg-gradient-to-r from-primary to-white bg-clip-text text-transparent">
              in minutes, not hours.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Upload a PDF and get a clear summary, the key findings, and a chat that has read
            every page — with flashcards and quizzes to make it stick.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link to="/auth">
              <Button size="lg" className="gap-2">
                Start for free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#features">
              <Button variant="ghost" size="lg">
                See how it works
              </Button>
            </a>
          </div>
        </div>

        <div id="features" className="mt-24 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: FileText,
              title: "Instant summaries",
              body: "Method, results, and limitations distilled into plain English.",
            },
            {
              icon: MessageSquare,
              title: "Chat with the paper",
              body: "Ask any question — get answers grounded in the source.",
            },
            {
              icon: Zap,
              title: "Learn faster",
              body: "Auto-generated flashcards and quizzes to lock it in.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur"
            >
              <div className="mb-4 grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
                <f.icon className="h-4 w-4" />
              </div>
              <h3 className="font-medium">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
