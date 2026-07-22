// Orchestrates the full processing pipeline for a single paper.
// Server-only: this file downloads the PDF, parses it, and writes results.
import type { SupabaseClient } from "@supabase/supabase-js";

import { analyzePaper } from "./analyze.server";
import { extractPaper } from "./extract.server";
import type { PaperStatus } from "./types";

type RunInput = {
  paperId: string;
  supabase: SupabaseClient;
  userId: string;
};

type UpdatePayload = Record<string, unknown>;

async function updatePaper(
  supabase: SupabaseClient,
  paperId: string,
  patch: UpdatePayload,
) {
  const { error } = await supabase.from("papers").update(patch).eq("id", paperId);
  if (error) throw new Error(`Failed to update paper: ${error.message}`);
}

async function setStage(
  supabase: SupabaseClient,
  paperId: string,
  status: PaperStatus,
  extra: UpdatePayload = {},
) {
  await updatePaper(supabase, paperId, { status, error_message: null, ...extra });
}

export async function runPipeline({ paperId, supabase, userId }: RunInput) {
  const { data: paper, error } = await supabase
    .from("papers")
    .select("id, user_id, file_path, status")
    .eq("id", paperId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!paper) throw new Error("Paper not found");
  if (paper.user_id !== userId) throw new Error("Forbidden");

  try {
    // Stage 1: download + extract
    await setStage(supabase, paperId, "extracting");

    const download = await supabase.storage.from("papers").download(paper.file_path);
    if (download.error || !download.data) {
      throw new Error(download.error?.message ?? "Failed to download PDF");
    }
    const buffer = await download.data.arrayBuffer();
    const { text, metadata } = await extractPaper(buffer);

    await updatePaper(supabase, paperId, {
      title: metadata.title ?? undefined,
      authors: metadata.authors ?? undefined,
      abstract: metadata.abstract,
      keywords: metadata.keywords,
      page_count: metadata.pageCount,
      extracted_text: text.slice(0, 250_000),
    });

    // Stage 2: analyze
    await setStage(supabase, paperId, "analyzing");
    const analysis = await analyzePaper({ text, metadata });

    // Stage 3: completed
    await setStage(supabase, paperId, "completed", {
      summary: analysis.summary,
      key_points: analysis.keyFindings,
      key_findings: analysis.keyFindings,
      methodology: analysis.methodology,
      conclusions: analysis.conclusions,
      references: analysis.references,
      tags: analysis.tags,
    });

    return { ok: true as const };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    await updatePaper(supabase, paperId, { status: "failed", error_message: message });
    return { ok: false as const, error: message };
  }
}