// Client-callable server functions for the Learning Studio.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const questionTypeEnum = z.enum(["mcq", "tf", "short", "fill"]);

const generateFlashcardsInput = z.object({
  paperId: z.string().uuid(),
  count: z.number().int().min(4).max(30).optional(),
  replace: z.boolean().optional(),
});

export const generateFlashcards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateFlashcardsInput.parse(data))
  .handler(async ({ data, context }) => {
    const { generateFlashcardsForPaper } = await import("./study/generate.server");
    return generateFlashcardsForPaper({
      supabase: context.supabase,
      userId: context.userId,
      paperId: data.paperId,
      count: data.count,
      replace: data.replace,
    });
  });

const generateQuizInput = z.object({
  paperId: z.string().uuid(),
  count: z.number().int().min(3).max(50),
  types: z.array(questionTypeEnum).min(1),
  title: z.string().max(120).optional(),
});

export const generateQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => generateQuizInput.parse(data))
  .handler(async ({ data, context }) => {
    const { generateQuizForPaper } = await import("./study/generate.server");
    return generateQuizForPaper({
      supabase: context.supabase,
      userId: context.userId,
      paperId: data.paperId,
      count: data.count,
      types: data.types,
      title: data.title,
    });
  });

const deleteQuizInput = z.object({ quizId: z.string().uuid() });

export const deleteQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => deleteQuizInput.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("quizzes")
      .delete()
      .eq("id", data.quizId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });