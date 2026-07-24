import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Brain, Download, ListChecks, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { FlashcardDeck } from "./flashcard-deck";
import { QuizRunner } from "./quiz-runner";
import {
  listFlashcards,
  listQuizAttempts,
  listStudySessions,
} from "@/lib/study/data";
import { computeStats } from "@/lib/study/stats";
import { exportStudyNotesMarkdown } from "@/lib/study/export";

type Props = { paperId: string; paperTitle: string; ready: boolean };

export function StudyPanel({ paperId, paperTitle, ready }: Props) {
  const [tab, setTab] = useState("overview");

  const { data: flashcards = [] } = useQuery({
    queryKey: ["study", paperId, "flashcards"],
    queryFn: () => listFlashcards(paperId),
    enabled: ready,
  });
  const { data: attempts = [] } = useQuery({
    queryKey: ["study", paperId, "attempts"],
    queryFn: () => listQuizAttempts(paperId),
    enabled: ready,
  });
  const { data: sessions = [] } = useQuery({
    queryKey: ["study", paperId, "sessions"],
    queryFn: () => listStudySessions(paperId),
    enabled: ready,
  });

  const stats = useMemo(
    () => computeStats({ flashcards, attempts, sessions }),
    [flashcards, attempts, sessions],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/60 p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Interactive Learning Studio</p>
          <p className="text-xs text-muted-foreground">
            AI-generated flashcards and quizzes, grounded in this paper.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            exportStudyNotesMarkdown({ paperTitle, flashcards, attempts, stats })
          }
          disabled={!ready || flashcards.length === 0}
        >
          <Download className="h-4 w-4" /> Study notes
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">
            <TrendingUp className="h-4 w-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="flashcards">
            <Brain className="h-4 w-4" /> Flashcards
          </TabsTrigger>
          <TabsTrigger value="quizzes">
            <ListChecks className="h-4 w-4" /> Quizzes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Mastery"
              value={`${Math.round(stats.masteryScore * 100)}%`}
              hint={`${stats.cardsMastered}/${stats.cardsTotal} cards mastered`}
              progress={stats.masteryScore * 100}
            />
            <StatCard
              label="Accuracy"
              value={
                stats.questionsAnswered > 0
                  ? `${Math.round(stats.correctPct * 100)}%`
                  : "—"
              }
              hint={`${stats.questionsAnswered} questions answered`}
              progress={stats.correctPct * 100}
            />
            <StatCard
              label="Study time"
              value={`${stats.studyMinutes} min`}
              hint={`${stats.cardsDue} card${stats.cardsDue === 1 ? "" : "s"} due now`}
            />
            <StatCard
              label="Streak"
              value={`${stats.streakDays} day${stats.streakDays === 1 ? "" : "s"}`}
              hint="Keep it going daily"
            />
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-primary">
                <BookOpen className="h-4 w-4" /> Recent quiz attempts
              </div>
              {attempts.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Take a quiz to see your history here.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {attempts.slice(0, 6).map((a) => {
                    const pct = Math.round((a.score / Math.max(1, a.total)) * 100);
                    return (
                      <li
                        key={a.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-background/40 px-3 py-2 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {new Date(a.completed_at).toLocaleString()}
                        </span>
                        <span className="font-medium">
                          {a.score}/{a.total}{" "}
                          <span className="text-muted-foreground">({pct}%)</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-2 text-sm text-primary">
                <TrendingUp className="h-4 w-4" /> Weak topics
              </div>
              {stats.weakTopics.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  We&apos;ll flag topics you miss most as you practice.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {stats.weakTopics.map((t) => (
                    <li key={t.label} className="text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-foreground/90">{t.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {Math.round(t.missRate * 100)}% missed
                        </span>
                      </div>
                      <Progress value={(1 - t.missRate) * 100} className="mt-1 h-1" />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="flashcards" className="mt-4">
          <FlashcardDeck paperId={paperId} paperTitle={paperTitle} ready={ready} />
        </TabsContent>

        <TabsContent value="quizzes" className="mt-4">
          <QuizRunner paperId={paperId} paperTitle={paperTitle} ready={ready} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  progress,
}: {
  label: string;
  value: string;
  hint?: string;
  progress?: number;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
      {typeof progress === "number" && (
        <Progress value={Math.max(0, Math.min(100, progress))} className="mt-2 h-1" />
      )}
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}