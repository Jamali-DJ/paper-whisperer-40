// Lightweight SM-2-inspired spaced repetition. Isomorphic.
// mastery is a 0..1 score. next_review_at grows with mastery.

import type { ReviewRating } from "./types";

const INTERVAL_DAYS: Record<ReviewRating, number> = {
  again: 0, // ~30 min
  hard: 1,
  good: 3,
  easy: 7,
};

const MASTERY_DELTA: Record<ReviewRating, number> = {
  again: -0.25,
  hard: 0.05,
  good: 0.15,
  easy: 0.25,
};

export function computeNextReview(input: {
  rating: ReviewRating;
  currentMastery: number;
  reviewCount: number;
}) {
  const raw = input.currentMastery + MASTERY_DELTA[input.rating];
  const mastery = Math.max(0, Math.min(1, raw));
  const base = INTERVAL_DAYS[input.rating];
  // Successful ratings grow with reviews and mastery.
  const growth =
    input.rating === "again" ? 0 : Math.pow(1 + mastery, input.reviewCount);
  const daysAhead = input.rating === "again" ? 0.02 : base * growth; // 0.02d ≈ 30min
  const next = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return {
    mastery,
    nextReviewAt: next.toISOString(),
  };
}

export function isDue(nextReviewAt: string | null): boolean {
  if (!nextReviewAt) return true;
  return new Date(nextReviewAt).getTime() <= Date.now();
}