// Thin wrapper that loads the paper row, then dispatches to the AI generator.
// Server-only.
import type { SupabaseClient } from "@supabase/supabase-js";

import { ANALYSIS_MODULE_KEYS, type AnalysisModuleKey } from "./modules";
import {
  generateAllAnalysisModules,
  generateAnalysisModule,
} from "./generate.server";

async function loadPaperForAnalysis(
  supabase: SupabaseClient,
  paperId: string,
  userId: string,
) {
  const { data, error } = await supabase
    .from("papers")
    .select("id, user_id, title, authors, abstract, extracted_text")
    .eq("id", paperId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Paper not found");
  if (data.user_id !== userId) throw new Error("Forbidden");
  if (!data.extracted_text)
    throw new Error("Paper text not extracted yet. Try again once processing completes.");
  return {
    title: (data.title as string | null) ?? null,
    authors: (data.authors as string | null) ?? null,
    abstract: (data.abstract as string | null) ?? null,
    text: data.extracted_text as string,
  };
}

export async function runModuleForPaper(input: {
  supabase: SupabaseClient;
  userId: string;
  paperId: string;
  moduleKey: AnalysisModuleKey;
}) {
  const paper = await loadPaperForAnalysis(input.supabase, input.paperId, input.userId);
  return generateAnalysisModule({
    supabase: input.supabase,
    paperId: input.paperId,
    userId: input.userId,
    moduleKey: input.moduleKey,
    paper,
  });
}

export async function runAllModulesForPaper(input: {
  supabase: SupabaseClient;
  userId: string;
  paperId: string;
}) {
  const paper = await loadPaperForAnalysis(input.supabase, input.paperId, input.userId);
  await generateAllAnalysisModules({
    supabase: input.supabase,
    paperId: input.paperId,
    userId: input.userId,
    paper,
    keys: ANALYSIS_MODULE_KEYS as AnalysisModuleKey[],
  });
  return { ok: true as const };
}