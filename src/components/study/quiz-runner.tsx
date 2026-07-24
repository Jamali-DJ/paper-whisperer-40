import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

import {
  getQuiz,
  insertQuizAttempt,
  listQuizAttempts,
  listQuizQuestions,
  listQuizzes,
} from "@/lib/study/data";
import { deleteQuiz, generateQuiz } from "@/lib/study.functions";
import { exportQuizPDF } from "@/lib/study/export";
import type {
  QuestionType,
  QuizAttemptAnswer,
  QuizQuestionRow,
  QuizRow,
} from "@/lib/study/types";

type Props = { paperId: string; paperTitle: string; ready: boolean };

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: "Multiple choice",
  tf: "True / False",
  short: "Short answer",
  fill: "Fill in the blank",
};

const COUNT_PRESETS = [10, 20, 30] as const;

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function isCorrect(q: QuizQuestionRow, given: string) {
  const g = normalize(given);
  if (!g) return false;
  if (q.type === "mcq" || q.type === "tf") return g === normalize(q.correct_answer);
  // short / fill: forgiving substring match either direction.
  const c = normalize(q.correct_answer);
  return g === c || g.includes(c) || c.includes(g);
}

export function QuizRunner({ paperId, paperTitle, ready }: Props) {
  const qc = useQueryClient();
  const runGenerate = useServerFn(generateQuiz);
  const runDelete = useServerFn(deleteQuiz);

  const [types, setTypes] = useState<QuestionType[]>(["mcq", "tf"]);
  const [count, setCount] = useState<number>(10);
  const [customCount, setCustomCount] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);

  const { data: quizzes = [] } = useQuery({
    queryKey: ["study", paperId, "quizzes"],
    queryFn: () => listQuizzes(paperId),
    enabled: ready,
    refetchInterval: (q) => {
      const rows = (q.state.data as QuizRow[] | undefined) ?? [];
      return rows.some((r) => r.status === "generating") ? 2500 : false;
    },
  });

  const { data: attempts = [] } = useQuery({
    queryKey: ["study", paperId, "attempts"],
    queryFn: () => listQuizAttempts(paperId),
    enabled: ready,
  });

  async function handleGenerate() {
    if (types.length === 0) {
      toast.error("Pick at least one question type.");
      return;
    }
    const n = customCount ? Math.max(3, Math.min(50, Number(customCount))) : count;
    if (!Number.isFinite(n)) return;
    setGenerating(true);
    try {
      const res = await runGenerate({ data: { paperId, count: n, types } });
      if (res.ok) {
        toast.success(`Quiz ready — ${res.count} questions`);
        setActiveQuizId(res.quizId);
      } else toast.error(res.error ?? "Generation failed");
      qc.invalidateQueries({ queryKey: ["study", paperId, "quizzes"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await runDelete({ data: { quizId: id } });
      if (activeQuizId === id) setActiveQuizId(null);
      qc.invalidateQueries({ queryKey: ["study", paperId, "quizzes"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  }

  if (!ready) {
    return (
      <EmptyState
        title="Analysis in progress"
        body="Quizzes will unlock as soon as the paper finishes processing."
      />
    );
  }

  if (activeQuizId) {
    return (
      <ActiveQuiz
        paperId={paperId}
        paperTitle={paperTitle}
        quizId={activeQuizId}
        onClose={() => setActiveQuizId(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 text-sm text-primary">
          <Sparkles className="h-4 w-4" /> Generate a new quiz
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Question types</p>
            <div className="mt-2 space-y-2">
              {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={types.includes(t)}
                    onCheckedChange={(v) =>
                      setTypes((prev) =>
                        v ? [...new Set([...prev, t])] : prev.filter((x) => x !== t),
                      )
                    }
                  />
                  {TYPE_LABEL[t]}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Length</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {COUNT_PRESETS.map((n) => (
                <Button
                  key={n}
                  size="sm"
                  variant={count === n && !customCount ? "default" : "outline"}
                  onClick={() => {
                    setCount(n);
                    setCustomCount("");
                  }}
                >
                  {n}
                </Button>
              ))}
              <Input
                value={customCount}
                onChange={(e) => setCustomCount(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Custom"
                inputMode="numeric"
                className="w-24"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Generate quiz
          </Button>
        </div>
      </div>

      {quizzes.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your quizzes
          </p>
          <div className="space-y-2">
            {quizzes.map((q) => {
              const best = attempts
                .filter((a) => a.quiz_id === q.id)
                .reduce((m, a) => Math.max(m, a.score / Math.max(1, a.total)), 0);
              return (
                <div
                  key={q.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{q.title}</p>
                      {q.status === "generating" && (
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Loader2 className="h-3 w-3 animate-spin" /> Generating
                        </Badge>
                      )}
                      {q.status === "failed" && (
                        <Badge variant="destructive" className="text-xs">
                          Failed
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {q.config.count} questions · {q.config.types.map((t) => TYPE_LABEL[t]).join(", ")}
                      {best > 0 && ` · Best ${Math.round(best * 100)}%`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      onClick={() => setActiveQuizId(q.id)}
                      disabled={q.status !== "ready"}
                    >
                      Take quiz
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleDelete(q.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {quizzes.length === 0 && (
        <EmptyState title="No quizzes yet" body="Configure a quiz above to get started." />
      )}
    </div>
  );
}

function ActiveQuiz({
  paperId,
  paperTitle,
  quizId,
  onClose,
}: {
  paperId: string;
  paperTitle: string;
  quizId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { data: quiz } = useQuery({
    queryKey: ["study", "quiz", quizId],
    queryFn: () => getQuiz(quizId),
  });
  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["study", "quiz", quizId, "questions"],
    queryFn: () => listQuizQuestions(quizId),
  });

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [idx, setIdx] = useState(0);
  const startedAt = useRef<number>(Date.now());

  useEffect(() => {
    startedAt.current = Date.now();
  }, [quizId]);

  const graded = useMemo(() => {
    return questions.map((q) => ({
      q,
      given: answers[q.id] ?? "",
      correct: isCorrect(q, answers[q.id] ?? ""),
    }));
  }, [questions, answers]);

  const score = graded.filter((g) => g.correct).length;
  const total = questions.length;
  const done = total > 0 && Object.keys(answers).length === total;

  async function submit() {
    if (!quiz) return;
    setSubmitted(true);
    const durationSec = Math.max(1, Math.round((Date.now() - startedAt.current) / 1000));
    const payload: QuizAttemptAnswer[] = graded.map((g) => ({
      question_id: g.q.id,
      given: g.given,
      correct: g.correct,
    }));
    try {
      await insertQuizAttempt({
        quiz_id: quiz.id,
        paper_id: paperId,
        score,
        total,
        duration_sec: durationSec,
        answers: payload,
      });
      qc.invalidateQueries({ queryKey: ["study", paperId, "attempts"] });
      qc.invalidateQueries({ queryKey: ["study", paperId, "sessions"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save attempt");
    }
  }

  async function download(withAnswers: boolean) {
    if (!quiz) return;
    try {
      await exportQuizPDF({
        paperTitle,
        quiz,
        questions,
        includeAnswers: withAnswers,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  }

  if (isLoading || !quiz) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const current = questions[idx];
  const progress = total ? ((idx + 1) / total) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{quiz.title}</p>
          <p className="text-xs text-muted-foreground">
            {total} questions · {quiz.config.types.map((t) => TYPE_LABEL[t]).join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => download(false)}>
            <Download className="h-4 w-4" /> PDF
          </Button>
          {submitted && (
            <Button variant="outline" size="sm" onClick={() => download(true)}>
              <Download className="h-4 w-4" /> PDF w/ answers
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            Back
          </Button>
        </div>
      </div>

      {!submitted && (
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            Question {idx + 1} of {total}
          </span>
          <Progress value={progress} className="h-1 flex-1" />
        </div>
      )}

      {!submitted && current && (
        <QuestionCard
          question={current}
          value={answers[current.id] ?? ""}
          onChange={(v) => setAnswers((a) => ({ ...a, [current.id]: v }))}
        />
      )}

      {!submitted && (
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0}>
            Previous
          </Button>
          {idx < total - 1 ? (
            <Button onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}>Next</Button>
          ) : (
            <Button onClick={submit} disabled={!done}>
              Submit
            </Button>
          )}
        </div>
      )}

      {submitted && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">Your score</p>
            <p className="text-3xl font-semibold">
              {score} / {total}{" "}
              <span className="text-lg text-muted-foreground">
                ({Math.round((score / Math.max(1, total)) * 100)}%)
              </span>
            </p>
          </div>
          <div className="space-y-3">
            {graded.map((g, i) => (
              <div key={g.q.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start gap-2">
                  {g.correct ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 text-rose-400" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {i + 1}. {g.q.question}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Your answer:{" "}
                      <span className="text-foreground/90">{g.given || "—"}</span>
                    </p>
                    {!g.correct && (
                      <p className="text-xs text-muted-foreground">
                        Correct:{" "}
                        <span className="text-foreground/90">{g.q.correct_answer}</span>
                      </p>
                    )}
                    {g.q.explanation && (
                      <p className="mt-2 text-xs text-muted-foreground">{g.q.explanation}</p>
                    )}
                    {g.q.citation?.page_start && (
                      <p className="mt-1 text-[11px] text-muted-foreground/80">
                        Source: {g.q.citation.section ?? "paper"} · p.{g.q.citation.page_start}
                        {g.q.citation.page_end && g.q.citation.page_end !== g.q.citation.page_start
                          ? `–${g.q.citation.page_end}`
                          : ""}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setAnswers({});
                setSubmitted(false);
                setIdx(0);
                startedAt.current = Date.now();
              }}
            >
              <RefreshCw className="h-4 w-4" /> Retake
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  value,
  onChange,
}: {
  question: QuizQuestionRow;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="outline" className="capitalize">
          {TYPE_LABEL[question.type]}
        </Badge>
        <Badge variant="outline" className="capitalize">
          {question.difficulty}
        </Badge>
      </div>
      <p className={cn("text-base font-medium leading-relaxed", "text-foreground")}>
        {question.question}
      </p>

      <div className="mt-4">
        {question.type === "mcq" && Array.isArray(question.options) && (
          <RadioGroup value={value} onValueChange={onChange} className="space-y-2">
            {question.options.map((opt, i) => {
              const id = `${question.id}-${i}`;
              return (
                <label
                  key={id}
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background/40 p-3 hover:bg-accent/40"
                >
                  <RadioGroupItem id={id} value={opt} className="mt-0.5" />
                  <span className="text-sm">{opt}</span>
                </label>
              );
            })}
          </RadioGroup>
        )}

        {question.type === "tf" && (
          <RadioGroup value={value} onValueChange={onChange} className="grid grid-cols-2 gap-2">
            {["True", "False"].map((opt) => {
              const id = `${question.id}-${opt}`;
              return (
                <label
                  key={id}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background/40 p-3 hover:bg-accent/40"
                >
                  <RadioGroupItem id={id} value={opt} />
                  <span className="text-sm">{opt}</span>
                </label>
              );
            })}
          </RadioGroup>
        )}

        {(question.type === "short" || question.type === "fill") && (
          <div className="space-y-1">
            <Label htmlFor={question.id} className="text-xs text-muted-foreground">
              Your answer
            </Label>
            <Input
              id={question.id}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={question.type === "fill" ? "Fill in the blank" : "Type your answer"}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
      <h3 className="text-base font-medium">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
    </div>
  );
}