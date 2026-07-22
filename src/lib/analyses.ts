// Client-side data access for paper_analyses rows.
import { supabase } from "@/integrations/supabase/client";

import type { AnalysisModuleKey } from "@/lib/ai/modules";

export type AnalysisStatus = "pending" | "generating" | "completed" | "failed";

export type PaperAnalysisRow = {
  id: string;
  paper_id: string;
  user_id: string;
  module_key: AnalysisModuleKey;
  status: AnalysisStatus;
  content: { markdown: string } | null;
  error_message: string | null;
  provider: string | null;
  model: string | null;
  created_at: string;
  updated_at: string;
};

// The generated Database type does not yet know about paper_analyses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as { from: (t: "paper_analyses") => any };

export async function listAnalyses(paperId: string): Promise<PaperAnalysisRow[]> {
  const { data, error } = await db
    .from("paper_analyses")
    .select("*")
    .eq("paper_id", paperId);
  if (error) throw error;
  return (data ?? []) as PaperAnalysisRow[];
}