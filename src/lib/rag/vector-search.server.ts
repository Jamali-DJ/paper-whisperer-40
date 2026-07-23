// Supabase-backed VectorSearchService. Stores embeddings in a JSONB column and
// ranks in-memory with cosine similarity blended with a keyword score. When a
// real vector store (pgvector, Pinecone, …) is plugged in, only this file
// changes — the UI and ChatService keep working unchanged.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Chunk, RetrievedChunk, VectorSearchService } from "./types";

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function keywordScore(query: string, content: string): number {
  const q = new Set(
    query.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2),
  );
  if (q.size === 0) return 0;
  const lower = content.toLowerCase();
  let hits = 0;
  for (const t of q) if (lower.includes(t)) hits += 1;
  return hits / q.size;
}

type Row = {
  id: string;
  paper_id: string;
  chunk_index: number;
  content: string;
  page_start: number | null;
  page_end: number | null;
  token_estimate: number | null;
  embedding: number[] | null;
};

function rowToChunk(r: Row): Chunk {
  return {
    id: r.id,
    paperId: r.paper_id,
    chunkIndex: r.chunk_index,
    content: r.content,
    pageStart: r.page_start,
    pageEnd: r.page_end,
    tokenEstimate: r.token_estimate ?? Math.round(r.content.length / 4),
    embedding: r.embedding,
  };
}

export class SupabaseVectorSearchService implements VectorSearchService {
  readonly name = "supabase-jsonb-cosine";
  constructor(private readonly supabase: SupabaseClient) {}

  async upsertChunks(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const paperId = chunks[0].paperId;
    await this.supabase.from("paper_chunks").delete().eq("paper_id", paperId);
    const rows = chunks.map((c) => ({
      paper_id: c.paperId,
      chunk_index: c.chunkIndex,
      content: c.content,
      page_start: c.pageStart,
      page_end: c.pageEnd,
      token_estimate: c.tokenEstimate,
      embedding: c.embedding,
    }));
    const { error } = await this.supabase.from("paper_chunks").insert(rows);
    if (error) throw new Error(`Chunk upsert failed: ${error.message}`);
  }

  async search(input: {
    paperId: string;
    userId: string;
    queryEmbedding: number[] | null;
    queryText: string;
    topK: number;
  }): Promise<RetrievedChunk[]> {
    const { data, error } = await this.supabase
      .from("paper_chunks")
      .select("id, paper_id, chunk_index, content, page_start, page_end, token_estimate, embedding")
      .eq("paper_id", input.paperId)
      .order("chunk_index", { ascending: true });
    if (error) throw new Error(`Chunk search failed: ${error.message}`);
    const chunks = ((data ?? []) as unknown as Row[]).map(rowToChunk);
    const scored = chunks.map((c) => {
      const embedScore = input.queryEmbedding && c.embedding
        ? cosine(input.queryEmbedding, c.embedding)
        : 0;
      const kw = keywordScore(input.queryText, c.content);
      const score = embedScore > 0 ? 0.7 * embedScore + 0.3 * kw : kw;
      return { ...c, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.filter((s) => s.score > 0).slice(0, input.topK);
  }
}