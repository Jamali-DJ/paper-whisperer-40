// RAG (Retrieval-Augmented Generation) contract types.
// The UI never depends on any concrete implementation — only on these types.
// Swapping providers (Lovable AI, pgvector, Pinecone, local model, …) is a
// server-only change behind the ChatService interface.

export type Chunk = {
  id: string;
  paperId: string;
  chunkIndex: number;
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
  tokenEstimate: number;
  embedding: number[] | null;
};

export type RetrievedChunk = Chunk & {
  /** Similarity score in [0,1]; interpretation depends on the search backend. */
  score: number;
};

export type Citation = {
  /** 1-based index shown to the user (`[1]`, `[2]`, …). */
  index: number;
  chunkId: string;
  pageStart: number | null;
  pageEnd: number | null;
  snippet: string;
};

export type ChatMessageInput = {
  role: "user" | "assistant" | "system";
  content: string;
};

/** Turns raw text into a fixed-size embedding vector. */
export interface EmbeddingProvider {
  readonly name: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/** Persists and searches vectors. Today: JSONB + in-memory cosine. */
export interface VectorSearchService {
  readonly name: string;
  upsertChunks(chunks: Chunk[]): Promise<void>;
  /** Returns the top-k most similar chunks for a paper. */
  search(input: {
    paperId: string;
    userId: string;
    queryEmbedding: number[] | null;
    queryText: string;
    topK: number;
  }): Promise<RetrievedChunk[]>;
}

/** Higher-level facade used by ChatService. */
export interface ChunkRetriever {
  retrieve(input: {
    paperId: string;
    userId: string;
    query: string;
    topK?: number;
  }): Promise<RetrievedChunk[]>;
}

/** Formats retrieved chunks into citation blocks + returns a Citation[] map. */
export interface CitationFormatter {
  format(chunks: RetrievedChunk[]): {
    contextBlock: string;
    citations: Citation[];
  };
}