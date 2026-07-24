// Client-side data access for the Learning Studio. Wraps supabase.from()
// calls with typed helpers so the UI stays declarative.
import { supabase } from "@/integrations/supabase/client";

import type {
  FlashcardRow,
  FlashcardDifficulty,
  QuizAttemptRow,
  QuizQuestionRow,
  QuizRow,
  StudySessionRow,
} from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = supabase as unknown as {
  from: (
    t:
      | "flashcards"
      | "flashcard_reviews"
      | "quizzes"
      | "quiz_questions"
      | "quiz_attempts"
      | "study_sessions",
  ) => any;
};

// ---------- flashcards ----------

export async function listFlashcards(paperId: string): Promise<FlashcardRow[]> {
  const { data, error } = await db
    .from("flashcards")
    .select("*")
    .eq("paper_id", paperId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as FlashcardRow[];
}

export async function updateFlashcard(
  id: string,
  patch: Partial<
    Pick<
      FlashcardRow,
      | "front"
      | "back"
      | "difficulty"
      | "favorite"
      | "mastery"
      | "review_count"
      | "next_review_at"
      | "last_reviewed_at"
    >
  >,
): Promise<void> {
  const { error } = await db.from("flashcards").update(patch).eq("id", id);
  if (error) throw error;
}

export async function setFlashcardDifficulty(
  id: string,
  difficulty: FlashcardDifficulty,
): Promise<void> {
  await updateFlashcard(id, { difficulty });
}

export async function toggleFlashcardFavorite(
  id: string,
  favorite: boolean,
): Promise<void> {
  await updateFlashcard(id, { favorite });
}

export async function insertFlashcardReview(row: {
  flashcard_id: string;
  rating: "again" | "hard" | "good" | "easy";
  previous_mastery: number;
  new_mastery: number;
  next_review_at: string;
}): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Not signed in");
  const { error } = await db.from("flashcard_reviews").insert({ ...row, user_id: uid });
  if (error) throw error;
}

// ---------- quizzes ----------

export async function listQuizzes(paperId: string): Promise<QuizRow[]> {
  const { data, error } = await db
    .from("quizzes")
    .select("*")
    .eq("paper_id", paperId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QuizRow[];
}

export async function getQuiz(quizId: string): Promise<QuizRow | null> {
  const { data, error } = await db
    .from("quizzes")
    .select("*")
    .eq("id", quizId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as QuizRow | null;
}

export async function listQuizQuestions(quizId: string): Promise<QuizQuestionRow[]> {
  const { data, error } = await db
    .from("quiz_questions")
    .select("*")
    .eq("quiz_id", quizId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data ?? []) as QuizQuestionRow[];
}

export async function insertQuizAttempt(row: {
  quiz_id: string;
  paper_id: string;
  score: number;
  total: number;
  duration_sec: number;
  answers: unknown[];
}): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) throw new Error("Not signed in");
  const { error } = await db.from("quiz_attempts").insert({ ...row, user_id: uid });
  if (error) throw error;
}

export async function listQuizAttempts(
  paperId: string,
): Promise<QuizAttemptRow[]> {
  const { data, error } = await db
    .from("quiz_attempts")
    .select("*")
    .eq("paper_id", paperId)
    .order("completed_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as QuizAttemptRow[];
}

// ---------- study sessions ----------

export async function recordStudySession(row: {
  paper_id: string | null;
  kind: "flashcard" | "quiz" | "review";
  duration_sec: number;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return;
  const { error } = await db.from("study_sessions").insert({
    user_id: uid,
    paper_id: row.paper_id,
    kind: row.kind,
    duration_sec: row.duration_sec,
    meta: row.meta ?? {},
  });
  if (error) throw error;
}

export async function listStudySessions(
  paperId?: string,
): Promise<StudySessionRow[]> {
  let q = db.from("study_sessions").select("*").order("created_at", { ascending: false }).limit(500);
  if (paperId) q = q.eq("paper_id", paperId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as StudySessionRow[];
}
/* eslint-enable @typescript-eslint/no-explicit-any */