// EmbeddingProvider implementations.
//
// Default is a deterministic keyword bag-of-words embedding: no external call,
// no keys, works offline. Good enough to bootstrap RAG. To switch to real
// semantic embeddings via the Lovable AI Gateway, set EMBEDDING_PROVIDER=lovable.
import type { EmbeddingProvider } from "./types";

const DIM = 256;

function hashToken(token: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h % DIM;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && t.length < 40);
}

function bagOfWordsVector(text: string): number[] {
  const v = new Array<number>(DIM).fill(0);
  for (const t of tokenize(text)) v[hashToken(t)] += 1;
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i] / norm;
  return v;
}

export class KeywordEmbeddingProvider implements EmbeddingProvider {
  readonly name = "keyword-bow";
  readonly dimensions = DIM;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map(bagOfWordsVector);
  }
}

export class LovableGatewayEmbeddingProvider implements EmbeddingProvider {
  readonly name = "lovable-gemini-embedding-2";
  readonly dimensions = 3072;
  constructor(private readonly apiKey: string) {}
  async embed(texts: string[]): Promise<number[][]> {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: "google/gemini-embedding-2", input: texts }),
    });
    if (!res.ok) throw new Error(`Embedding provider ${res.status}`);
    const json = (await res.json()) as { data: { embedding: number[] }[] };
    return json.data.map((d) => d.embedding);
  }
}

let cached: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  const kind = process.env.EMBEDDING_PROVIDER ?? "keyword";
  if (kind === "lovable") {
    const key = process.env.LOVABLE_API_KEY;
    if (key) {
      cached = new LovableGatewayEmbeddingProvider(key);
      return cached;
    }
  }
  cached = new KeywordEmbeddingProvider();
  return cached;
}