// Aggregations for the Study dashboard. Isomorphic and pure.
import type {
  FlashcardRow,
  QuizAttemptRow,
  StudySessionRow,
} from "./types";

export type StudyStats = {
  cardsTotal: number;
  cardsMastered: number;
  cardsDue: number;
  masteryScore: number; // 0..1
  questionsAnswered: number;
  correctPct: number; // 0..1
  studyMinutes: number;
  streakDays: number;
  weakTopics: { label: string; missRate: number; count: number }[];
};

export function computeStats(input: {
  flashcards: FlashcardRow[];
  attempts: QuizAttemptRow[];
  sessions: StudySessionRow[];
  questionsByTopic?: Map<string, { correct: number; total: number }>;
}): StudyStats {
  const { flashcards, attempts, sessions } = input;

  const cardsTotal = flashcards.length;
  const cardsMastered = flashcards.filter((c) => c.mastery >= 0.8).length;
  const now = Date.now();
  const cardsDue = flashcards.filter(
    (c) => !c.next_review_at || new Date(c.next_review_at).getTime() <= now,
  ).length;
  const masteryScore =
    cardsTotal === 0
      ? 0
      : flashcards.reduce((s, c) => s + c.mastery, 0) / cardsTotal;

  const questionsAnswered = attempts.reduce((s, a) => s + a.total, 0);
  const totalCorrect = attempts.reduce((s, a) => s + a.score, 0);
  const correctPct = questionsAnswered === 0 ? 0 : totalCorrect / questionsAnswered;

  const studySeconds =
    sessions.reduce((s, x) => s + x.duration_sec, 0) +
    attempts.reduce((s, a) => s + a.duration_sec, 0);
  const studyMinutes = Math.round(studySeconds / 60);

  const streakDays = computeStreak(
    [
      ...sessions.map((s) => s.created_at),
      ...attempts.map((a) => a.completed_at),
    ],
  );

  const weakTopics: StudyStats["weakTopics"] = [];
  if (input.questionsByTopic) {
    for (const [label, v] of input.questionsByTopic.entries()) {
      if (v.total < 2) continue;
      const missRate = 1 - v.correct / v.total;
      if (missRate > 0.3) weakTopics.push({ label, missRate, count: v.total });
    }
    weakTopics.sort((a, b) => b.missRate - a.missRate);
  }

  return {
    cardsTotal,
    cardsMastered,
    cardsDue,
    masteryScore,
    questionsAnswered,
    correctPct,
    studyMinutes,
    streakDays,
    weakTopics: weakTopics.slice(0, 5),
  };
}

function computeStreak(dateStrings: string[]): number {
  const days = new Set(
    dateStrings.map((d) => new Date(d).toISOString().slice(0, 10)),
  );
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else if (streak === 0) {
      // grace: allow yesterday-only streak start
      cursor.setDate(cursor.getDate() - 1);
      const k2 = cursor.toISOString().slice(0, 10);
      if (days.has(k2)) {
        streak = 1;
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    } else {
      break;
    }
  }
  return streak;
}