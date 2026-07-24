// FlashcardService + QuizService — server-side generators. Uses the shared
// AIService so swapping providers doesn't touch this file.
import type { SupabaseClient } from "@supabase/supabase-js";

import { getAIService } from "@/lib/ai/service.server";
import type { QuestionType } from "./types";

const MAX_PAPER_CHARS = 40_000;

function trimPaper(text: string) {
  return text.length > MAX_PAPER_CHARS ? text.slice(0, MAX_PAPER_CHARS) : text;
}

function extractJson(raw: string): unknown {
  let s = raw.trim();
  // Strip common code fences.
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // Trim to first { or [ .. last matching bracket.
  const first = s.search(/[[{]/);
  const last = Math.max(s.lastIndexOf("]"), s.lastIndexOf("}"));
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return JSON.parse(s);
}

async function loadPaper(
  supabase: SupabaseClient,
  paperId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("papers")
    .select("id, user_id, title, authors, abstract, extracted_text, page_count")
    .eq("id", paperId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Paper not found");
  if (data.user_id !== userId) throw new Error("Forbidden");
  if (!data.extracted_text)
    throw new Error("Paper text not extracted yet. Try again shortly.");
  return data as {
    id: string;
    user_id: string;
    title: string | null;
    authors: string | null;
    abstract: string | null;
    extracted_text: string;
    page_count: number | null;
  };
}

// ---------- Flashcards ----------

type GenFlashcard = {
  front: string;
  back: string;
  difficulty?: "easy" | "medium" | "hard";
  section?: string;
  page_start?: number;
  page_end?: number;
};

const FLASHCARDS_SYSTEM = `You are a study assistant that turns academic papers into high-quality flashcards.
Rules:
- Ground every card strictly in the provided paper text.
- Front: one focused question. Back: a concise, complete answer (1–3 sentences).
- Vary difficulty (easy/medium/hard). Cover definitions, key results, methods, and implications.
- If the paper is short, generate fewer cards rather than filler.
- Output ONLY a JSON array. No prose, no code fences.

Each item:
{
  "front": string,
  "back": string,
  "difficulty": "easy" | "medium" | "hard",
  "section": string,       // e.g. "Methods", "Results"
  "page_start": number|null,
  "page_end": number|null
}`;

export async function generateFlashcardsForPaper(input: {
  supabase: SupabaseClient;
  userId: string;
  paperId: string;
  count?: number;
  replace?: boolean;
}) {
  const paper = await loadPaper(input.supabase, input.paperId, input.userId);
  const count = Math.min(30, Math.max(6, input.count ?? 16));

  const ai = getAIService();
  const prompt = [
    paper.title ? `Title: ${paper.title}` : null,
    paper.authors ? `Authors: ${paper.authors}` : null,
    paper.abstract ? `Abstract: ${paper.abstract}` : null,
    paper.page_count ? `Total pages: ${paper.page_count}` : null,
    "",
    `Generate exactly ${count} flashcards.`,
    "",
    "--- PAPER TEXT (may be truncated) ---",
    trimPaper(paper.extracted_text),
  ]
    .filter(Boolean)
    .join("\n");

  const res = await ai.generate({
    system: FLASHCARDS_SYSTEM,
    prompt,
    maxTokens: 3000,
  });
  const parsed = extractJson(res.text) as GenFlashcard[];
  if (!Array.isArray(parsed)) throw new Error("AI did not return a card array.");

  if (input.replace) {
    const { error: delErr } = await input.supabase
      .from("flashcards")
      .delete()
      .eq("paper_id", input.paperId)
      .eq("user_id", input.userId);
    if (delErr) throw new Error(delErr.message);
  }

  const rows = parsed
    .filter((c) => c && typeof c.front === "string" && typeof c.back === "string")
    .map((c, i) => ({
      user_id: input.userId,
      paper_id: input.paperId,
      front: c.front.trim(),
      back: c.back.trim(),
      difficulty:
        c.difficulty === "easy" || c.difficulty === "medium" || c.difficulty === "hard"
          ? c.difficulty
          : "unrated",
      section: typeof c.section === "string" ? c.section.trim() || null : null,
      page_start: typeof c.page_start === "number" ? c.page_start : null,
      page_end: typeof c.page_end === "number" ? c.page_end : null,
      position: i,
    }));
  if (rows.length === 0) throw new Error("AI returned zero valid cards.");

  const { error: insErr } = await input.supabase.from("flashcards").insert(rows);
  if (insErr) throw new Error(insErr.message);
  return { ok: true as const, count: rows.length };
}

// ---------- Quizzes ----------

type GenQuestion = {
  type: QuestionType;
  question: string;
  options?: string[];
  correct_answer: string;
  explanation?: string;
  difficulty?: "easy" | "medium" | "hard";
  section?: string;
  page_start?: number;
  page_end?: number;
};

const QUIZ_SYSTEM = `You are a study assistant that writes rigorous quizzes about academic papers.
Rules:
- Ground every question strictly in the provided paper text; never invent facts.
- Mix requested question types evenly across easy/medium/hard difficulties.
- MCQ: EXACTLY 4 plausible options; correct_answer must be one of the options verbatim.
- TF: correct_answer is exactly "True" or "False".
- SHORT: correct_answer is a short 1–2 sentence model answer.
- FILL: question contains "____"; correct_answer is the missing phrase.
- Include a short explanation citing what the paper says.
- Output ONLY a JSON array. No prose, no code fences.

Each item:
{
  "type": "mcq"|"tf"|"short"|"fill",
  "question": string,
  "options": string[] | null,
  "correct_answer": string,
  "explanation": string,
  "difficulty": "easy"|"medium"|"hard",
  "section": string,
  "page_start": number|null,
  "page_end": number|null
}`;

export async function generateQuizForPaper(input: {
  supabase: SupabaseClient;
  userId: string;
  paperId: string;
  count: number;
  types: QuestionType[];
  title?: string;
}) {
  const paper = await loadPaper(input.supabase, input.paperId, input.userId);
  const count = Math.min(50, Math.max(3, input.count));
  const types = input.types.length > 0 ? input.types : (["mcq", "tf", "short", "fill"] as QuestionType[]);

  // Create the quiz row first with 'generating' status.
  const { data: created, error: quizErr } = await input.supabase
    .from("quizzes")
    .insert({
      user_id: input.userId,
      paper_id: input.paperId,
      title: input.title ?? `${count}-question quiz`,
      config: { count, types },
      status: "generating",
    })
    .select("id")
    .single();
  if (quizErr) throw new Error(quizErr.message);
  const quizId = created.id as string;

  try {
    const ai = getAIService();
    const prompt = [
      paper.title ? `Title: ${paper.title}` : null,
      paper.authors ? `Authors: ${paper.authors}` : null,
      paper.abstract ? `Abstract: ${paper.abstract}` : null,
      "",
      `Generate EXACTLY ${count} questions using only these types: ${types.join(", ")}.`,
      "",
      "--- PAPER TEXT (may be truncated) ---",
      trimPaper(paper.extracted_text),
    ]
      .filter(Boolean)
      .join("\n");
    const res = await ai.generate({
      system: QUIZ_SYSTEM,
      prompt,
      maxTokens: 4000,
    });
    const parsed = extractJson(res.text) as GenQuestion[];
    if (!Array.isArray(parsed) || parsed.length === 0)
      throw new Error("AI returned no questions.");

    const rows = parsed
      .filter(
        (q) =>
          q &&
          typeof q.question === "string" &&
          typeof q.correct_answer === "string" &&
          (["mcq", "tf", "short", "fill"] as QuestionType[]).includes(q.type),
      )
      .map((q, i) => ({
        user_id: input.userId,
        quiz_id: quizId,
        position: i,
        type: q.type,
        question: q.question.trim(),
        options:
          q.type === "mcq" && Array.isArray(q.options)
            ? q.options.slice(0, 6).map((s) => String(s))
            : null,
        correct_answer: q.correct_answer.trim(),
        explanation: q.explanation?.trim() ?? null,
        difficulty:
          q.difficulty === "easy" || q.difficulty === "hard" ? q.difficulty : "medium",
        citation: {
          section: q.section ?? null,
          page_start: typeof q.page_start === "number" ? q.page_start : null,
          page_end: typeof q.page_end === "number" ? q.page_end : null,
        },
      }));
    if (rows.length === 0) throw new Error("No valid questions produced.");

    const { error: insErr } = await input.supabase.from("quiz_questions").insert(rows);
    if (insErr) throw new Error(insErr.message);

    await input.supabase
      .from("quizzes")
      .update({ status: "ready", error_message: null })
      .eq("id", quizId);

    return { ok: true as const, quizId, count: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Quiz generation failed";
    await input.supabase
      .from("quizzes")
      .update({ status: "failed", error_message: message })
      .eq("id", quizId);
    return { ok: false as const, quizId, error: message };
  }
}