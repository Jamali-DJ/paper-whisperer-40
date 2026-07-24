import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Search,
  Shuffle,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import {
  insertFlashcardReview,
  listFlashcards,
  setFlashcardDifficulty,
  toggleFlashcardFavorite,
  updateFlashcard,
  recordStudySession,
} from "@/lib/study/data";
import { generateFlashcards } from "@/lib/study.functions";
import { computeNextReview } from "@/lib/study/spaced-repetition";
import { exportFlashcardsCSV } from "@/lib/study/export";
import type {
  FlashcardDifficulty,
  FlashcardRow,
  ReviewRating,
} from "@/lib/study/types";

type Props = { paperId: string; paperTitle: string; ready: boolean };

const DIFF_COLORS: Record<FlashcardDifficulty, string> = {
  easy: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  hard: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  unrated: "bg-muted text-muted-foreground border-border",
};

export function FlashcardDeck({ paperId, paperTitle, ready }: Props) {
  const qc = useQueryClient();
  const runGenerate = useServerFn(generateFlashcards);
  const [generating, setGenerating] = useState(false);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [q, setQ] = useState("");
  const [section, setSection] = useState<string>("all");
  const [order, setOrder] = useState<string[] | null>(null);
  const startedAt = useRef<number>(Date.now());

  const { data: cards = [], isLoading } = useQuery({
    queryKey: ["study", paperId, "flashcards"],
    queryFn: () => listFlashcards(paperId),
    enabled: ready,
  });

  useEffect(() => {
    startedAt.current = Date.now();
    return () => {
      const secs = Math.round((Date.now() - startedAt.current) / 1000);
      if (secs > 5) {
        recordStudySession({
          paper_id: paperId,
          kind: "flashcard",
          duration_sec: secs,
        }).catch(() => {});
      }
    };
  }, [paperId]);

  const sections = useMemo(() => {
    const s = new Set<string>();
    cards.forEach((c) => c.section && s.add(c.section));
    return Array.from(s).sort();
  }, [cards]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = cards.filter((c) => {
      if (section !== "all" && c.section !== section) return false;
      if (!term) return true;
      return (
        c.front.toLowerCase().includes(term) ||
        c.back.toLowerCase().includes(term)
      );
    });
    if (order) {
      const rank = new Map(order.map((id, i) => [id, i]));
      list = [...list].sort(
        (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0),
      );
    }
    return list;
  }, [cards, q, section, order]);

  useEffect(() => {
    if (index >= filtered.length) setIndex(0);
    setFlipped(false);
  }, [filtered.length, index]);

  const current: FlashcardRow | undefined = filtered[index];

  async function handleGenerate(replace: boolean) {
    setGenerating(true);
    try {
      const res = await runGenerate({ data: { paperId, count: 16, replace } });
      if ("ok" in res && res.ok) {
        toast.success(`Generated ${res.count} flashcards`);
        qc.invalidateQueries({ queryKey: ["study", paperId, "flashcards"] });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  function shuffle() {
    const ids = filtered.map((c) => c.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    setOrder(ids);
    setIndex(0);
    setFlipped(false);
  }

  async function rate(rating: ReviewRating) {
    if (!current) return;
    const { mastery, nextReviewAt } = computeNextReview({
      rating,
      currentMastery: current.mastery,
      reviewCount: current.review_count,
    });
    try {
      await updateFlashcard(current.id, {
        mastery,
        review_count: current.review_count + 1,
        next_review_at: nextReviewAt,
        last_reviewed_at: new Date().toISOString(),
      });
      await insertFlashcardReview({
        flashcard_id: current.id,
        rating,
        previous_mastery: current.mastery,
        new_mastery: mastery,
        next_review_at: nextReviewAt,
      });
      qc.invalidateQueries({ queryKey: ["study", paperId, "flashcards"] });
      next();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function markDifficulty(d: FlashcardDifficulty) {
    if (!current) return;
    try {
      await setFlashcardDifficulty(current.id, d);
      qc.invalidateQueries({ queryKey: ["study", paperId, "flashcards"] });
    } catch {
      /* noop */
    }
  }

  async function toggleFav() {
    if (!current) return;
    try {
      await toggleFlashcardFavorite(current.id, !current.favorite);
      qc.invalidateQueries({ queryKey: ["study", paperId, "flashcards"] });
    } catch {
      /* noop */
    }
  }

  function next() {
    setFlipped(false);
    setIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
  }
  function prev() {
    setFlipped(false);
    setIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
  }

  if (!ready) {
    return (
      <EmptyState
        title="Analysis in progress"
        body="Flashcards will unlock as soon as the paper finishes processing."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="grid place-items-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
        <Sparkles className="mx-auto h-6 w-6 text-primary" />
        <h3 className="mt-3 text-lg font-medium">No flashcards yet</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          Generate a deck of AI-crafted flashcards grounded in this paper.
        </p>
        <Button className="mt-4" onClick={() => handleGenerate(false)} disabled={generating}>
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Generate flashcards
        </Button>
      </div>
    );
  }

  const progress = filtered.length ? ((index + 1) / filtered.length) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search cards…"
            className="pl-8"
          />
        </div>
        <Select value={section} onValueChange={setSection}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Section" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sections.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={shuffle}>
          <Shuffle className="h-4 w-4" /> Shuffle
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => exportFlashcardsCSV({ paperTitle, flashcards: cards })}
        >
          <Download className="h-4 w-4" /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleGenerate(true)}
          disabled={generating}
        >
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Regenerate
        </Button>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>
          Card {filtered.length ? index + 1 : 0} of {filtered.length}
        </span>
        <Progress value={progress} className="h-1 flex-1" />
      </div>

      {current ? (
        <div className="[perspective:1600px]">
          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="relative block h-72 w-full text-left"
            aria-label="Flip card"
          >
            <div
              className={cn(
                "absolute inset-0 rounded-2xl border border-border bg-card p-6 shadow-lg transition-transform duration-500 [transform-style:preserve-3d]",
                flipped && "[transform:rotateY(180deg)]",
              )}
            >
              <FaceFront card={current} />
              <FaceBack card={current} />
            </div>
          </button>
        </div>
      ) : (
        <EmptyState title="No cards match" body="Try a different filter or search term." />
      )}

      {current && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prev} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={next} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleFav}
                className={current.favorite ? "text-amber-400" : ""}
              >
                <Star className={cn("h-4 w-4", current.favorite && "fill-current")} />
                Favorite
              </Button>
            </div>
            <div className="flex items-center gap-1">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={current.difficulty === d ? "default" : "outline"}
                  onClick={() => markDifficulty(d)}
                  className="capitalize"
                >
                  {d}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card/60 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Rate recall to schedule the next review
            </p>
            <div className="grid grid-cols-4 gap-2">
              <ReviewButton label="Again" onClick={() => rate("again")} tone="rose" />
              <ReviewButton label="Hard" onClick={() => rate("hard")} tone="amber" />
              <ReviewButton label="Good" onClick={() => rate("good")} tone="sky" />
              <ReviewButton label="Easy" onClick={() => rate("easy")} tone="emerald" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FaceFront({ card }: { card: FlashcardRow }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-between p-6 [backface-visibility:hidden]">
      <MetaRow card={card} />
      <p className="text-center text-lg font-medium leading-relaxed text-foreground sm:text-xl">
        {card.front}
      </p>
      <p className="text-center text-xs text-muted-foreground">Tap to flip</p>
    </div>
  );
}

function FaceBack({ card }: { card: FlashcardRow }) {
  return (
    <div className="absolute inset-0 flex flex-col justify-between overflow-auto p-6 [transform:rotateY(180deg)] [backface-visibility:hidden]">
      <MetaRow card={card} />
      <p className="text-sm leading-relaxed text-foreground/90">{card.back}</p>
      <p className="text-right text-xs text-muted-foreground">Tap to flip back</p>
    </div>
  );
}

function MetaRow({ card }: { card: FlashcardRow }) {
  const pages =
    card.page_start != null
      ? card.page_end && card.page_end !== card.page_start
        ? `p.${card.page_start}–${card.page_end}`
        : `p.${card.page_start}`
      : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn("capitalize", DIFF_COLORS[card.difficulty])}>
          {card.difficulty}
        </Badge>
        {card.section && (
          <span className="rounded-full border border-border px-2 py-0.5">{card.section}</span>
        )}
      </div>
      {pages && <span>{pages}</span>}
    </div>
  );
}

function ReviewButton({
  label,
  onClick,
  tone,
}: {
  label: string;
  onClick: () => void;
  tone: "rose" | "amber" | "sky" | "emerald";
}) {
  const map: Record<string, string> = {
    rose: "border-rose-500/40 hover:bg-rose-500/10 text-rose-300",
    amber: "border-amber-500/40 hover:bg-amber-500/10 text-amber-300",
    sky: "border-sky-500/40 hover:bg-sky-500/10 text-sky-300",
    emerald: "border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-300",
  };
  return (
    <Button variant="outline" onClick={onClick} className={cn("w-full", map[tone])}>
      {label}
    </Button>
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