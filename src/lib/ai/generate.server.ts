// Runs a single analysis module for a paper and writes the result to
// `paper_analyses`. Called both by the initial pipeline and by the
// user-facing "regenerate" button.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AnalysisModuleKey } from "./modules";
import { getModule } from "./modules";
import { getAIService } from "./service.server";

const MAX_PAPER_CHARS = 40_000;

function buildUserPrompt(opts: {
  title: string | null;
  authors: string | null;
  abstract: string | null;
  text: string;
}) {
  const header = [
    opts.title ? `Title: ${opts.title}` : null,
    opts.authors ? `Authors: ${opts.authors}` : null,
    opts.abstract ? `Abstract: ${opts.abstract}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const body = opts.text.slice(0, MAX_PAPER_CHARS);
  return `${header}\n\n--- PAPER TEXT (may be truncated) ---\n${body}`;
}

async function upsertModule(
  supabase: SupabaseClient,
  row: {
    paper_id: string;
    user_id: string;
    module_key: string;
    status: "pending" | "generating" | "completed" | "failed";
    content?: { markdown: string } | null;
    error_message?: string | null;
    provider?: string | null;
    model?: string | null;
  },
) {
  const { error } = await supabase
    .from("paper_analyses")
    .upsert(row, { onConflict: "paper_id,module_key" });
  if (error) throw new Error(`paper_analyses upsert failed: ${error.message}`);
}

export async function generateAnalysisModule(input: {
  supabase: SupabaseClient;
  paperId: string;
  userId: string;
  moduleKey: AnalysisModuleKey;
  paper: {
    title: string | null;
    authors: string | null;
    abstract: string | null;
    text: string;
  };
}) {
  const def = getModule(input.moduleKey);
  if (!def) throw new Error(`Unknown analysis module: ${input.moduleKey}`);

  await upsertModule(input.supabase, {
    paper_id: input.paperId,
    user_id: input.userId,
    module_key: def.key,
    status: "generating",
    error_message: null,
  });

  try {
    const ai = getAIService();
    const result = await ai.generate({
      system: def.system,
      prompt: buildUserPrompt(input.paper),
      maxTokens: def.maxTokens,
    });
    await upsertModule(input.supabase, {
      paper_id: input.paperId,
      user_id: input.userId,
      module_key: def.key,
      status: "completed",
      content: { markdown: result.text },
      provider: result.provider,
      model: result.model,
      error_message: null,
    });
    return { ok: true as const, text: result.text };
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    await upsertModule(input.supabase, {
      paper_id: input.paperId,
      user_id: input.userId,
      module_key: def.key,
      status: "failed",
      error_message: message,
    });
    return { ok: false as const, error: message };
  }
}

export async function generateAllAnalysisModules(input: {
  supabase: SupabaseClient;
  paperId: string;
  userId: string;
  paper: {
    title: string | null;
    authors: string | null;
    abstract: string | null;
    text: string;
  };
  keys: AnalysisModuleKey[];
}) {
  // Sequential to stay well under provider rate limits.
  for (const key of input.keys) {
    await generateAnalysisModule({
      supabase: input.supabase,
      paperId: input.paperId,
      userId: input.userId,
      moduleKey: key,
      paper: input.paper,
    });
  }
}