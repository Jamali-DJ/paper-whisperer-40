// Chunk a paper's extracted text and persist it, ready for retrieval.
import type { SupabaseClient } from "@supabase/supabase-js";

import { chunkPaperText } from "./chunker.server";
import { getEmbeddingProvider } from "./embeddings.server";
import { detectReferencesStart } from "../pipeline/references.server";

export async function indexPaperForRAG(input: {
  supabase: SupabaseClient;
  paperId: string;
  userId: string;
  text: string;
  pageCount: number | null;
}) {
  // Exclude the references block from RAG so citations don't crowd out real
  // paper content in retrieval results.
  const bodyEndOffset = detectReferencesStart(input.text);
  const draftChunks = chunkPaperText({
    paperId: input.paperId,
    text: input.text,
    pageCount: input.pageCount,
    bodyEndOffset,
  });
  if (draftChunks.length === 0) return { count: 0 };

  const embedder = getEmbeddingProvider();
  const embeddings = await embedder
    .embed(draftChunks.map((c) => c.content))
    .catch(() => draftChunks.map(() => null as number[] | null));

  const rows = draftChunks.map((c, i) => ({
    paper_id: c.paperId,
    user_id: input.userId,
    chunk_index: c.chunkIndex,
    content: c.content,
    page_start: c.pageStart,
    page_end: c.pageEnd,
    token_estimate: c.tokenEstimate,
    embedding: embeddings[i] ?? null,
  }));

  await input.supabase.from("paper_chunks").delete().eq("paper_id", input.paperId);
  const { error } = await input.supabase.from("paper_chunks").insert(rows);
  if (error) throw new Error(`Chunk persist failed: ${error.message}`);
  return { count: rows.length };
}