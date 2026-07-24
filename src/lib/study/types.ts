// Shared types for the Interactive Learning Studio.
// Isomorphic — safe to import from client and server.

export type Difficulty = "easy" | "medium" | "hard";
export type FlashcardDifficulty = Difficulty | "unrated";
export type ReviewRating = "again" | "hard" | "good" | "easy";
export type QuestionType = "mcq" | "tf" | "short" | "fill";

export type FlashcardRow = {
  id: string;
  user_id: string;
  paper_id: string;
  front: string;
  back: string;
  difficulty: FlashcardDifficulty;
  section: string | null;
  page_start: number | null;
  page_end: number | null;
  favorite: boolean;
  mastery: number;
  review_count: number;
  next_review_at: string | null;
  last_reviewed_at: string | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type FlashcardReviewRow = {
  id: string;
  user_id: string;
  flashcard_id: string;
  rating: ReviewRating;
  previous_mastery: number | null;
  new_mastery: number | null;
  next_review_at: string | null;
  reviewed_at: string;
};

export type QuizConfig = {
  count: number;
  types: QuestionType[];
};

export type QuizRow = {
  id: string;
  user_id: string;
  paper_id: string;
  title: string;
  config: QuizConfig;
  status: "generating" | "ready" | "failed";
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type Citation = {
  page_start: number | null;
  page_end: number | null;
  section: string | null;
};

export type QuizQuestionRow = {
  id: string;
  user_id: string;
  quiz_id: string;
  position: number;
  type: QuestionType;
  question: string;
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  citation: Citation | null;
  difficulty: Difficulty;
  created_at: string;
};

export type QuizAttemptAnswer = {
  question_id: string;
  given: string;
  correct: boolean;
};

export type QuizAttemptRow = {
  id: string;
  user_id: string;
  quiz_id: string;
  paper_id: string;
  score: number;
  total: number;
  duration_sec: number;
  answers: QuizAttemptAnswer[];
  completed_at: string;
  created_at: string;
};

export type StudySessionRow = {
  id: string;
  user_id: string;
  paper_id: string | null;
  kind: "flashcard" | "quiz" | "review";
  duration_sec: number;
  meta: Record<string, unknown>;
  created_at: string;
};