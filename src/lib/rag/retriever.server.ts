// Thin facade tying an EmbeddingProvider to a VectorSearchService.
import type { SupabaseClient } from "@supabase/supabase-js";

import { getEmbeddingProvider } from "./embeddings.server";
import type { ChunkRetriever, RetrievedChunk } from "./types";
import { SupabaseVectorSearchService } from "./vector-search.server";

export class DefaultChunkRetriever implements ChunkRetriever {
  constructor(private readonly supabase: SupabaseClient) {}

  async retrieve(input: {
    paperId: string;
    userId: string;
    query: string;
    topK?: number;
  }): Promise<RetrievedChunk[]> {
    const topK = input.topK ?? 6;
    const embedder = getEmbeddingProvider();
    let queryEmbedding: number[] | null = null;
    try {
      const [vec] = await embedder.embed([input.query]);
      queryEmbedding = vec ?? null;
    } catch {
      queryEmbedding = null;
    }
    const search = new SupabaseVectorSearchService(input.userId ? this.supabase : this.supabase);
    return search.search({
      paperId: input.paperId,
      userId: input.userId,
      queryEmbedding,
      queryText: input.query,
      topK,
    });
  }
}