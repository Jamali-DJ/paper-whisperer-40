// Server-only text chunker. Splits an extracted paper into overlapping
// chunks with estimated page numbers. Keeps the boundary logic in one place
// so the retrieval + citation quality is easy to tune.
import type { Chunk } from "./types";

const TARGET_CHARS = 900;
const OVERLAP_CHARS = 150;
const MIN_CHUNK_CHARS = 200;

function estimatePage(offset: number, textLength: number, pageCount: number | null): number | null {
  if (!pageCount || pageCount <= 0 || textLength <= 0) return null;
  const ratio = Math.min(1, Math.max(0, offset / textLength));
  return Math.min(pageCount, Math.max(1, Math.round(ratio * pageCount) || 1));
}

function splitAtBoundary(text: string, start: number, target: number): number {
  const hardEnd = Math.min(text.length, start + target);
  if (hardEnd >= text.length) return text.length;
  // Prefer paragraph break, then sentence end, then newline, then space.
  const window = text.slice(start, hardEnd + 200);
  const rel =
    findLast(window, /\n\n+/g) ??
    findLast(window, /(?<=[.!?])\s+(?=[A-Z0-9])/g) ??
    findLast(window, /\n/g) ??
    findLast(window, / /g);
  return rel != null ? start + rel : hardEnd;
}

function findLast(text: string, re: RegExp): number | null {
  let last: number | null = null;
  for (const m of text.matchAll(re)) last = (m.index ?? 0) + m[0].length;
  return last;
}

export function chunkPaperText(input: {
  paperId: string;
  text: string;
  pageCount: number | null;
}): Omit<Chunk, "id" | "embedding">[] {
  const clean = input.text.replace(/\r\n/g, "\n");
  const chunks: Omit<Chunk, "id" | "embedding">[] = [];
  let start = 0;
  let index = 0;
  while (start < clean.length) {
    const end = splitAtBoundary(clean, start, TARGET_CHARS);
    const content = clean.slice(start, end).trim();
    if (content.length >= MIN_CHUNK_CHARS || start === 0) {
      chunks.push({
        paperId: input.paperId,
        chunkIndex: index++,
        content,
        pageStart: estimatePage(start, clean.length, input.pageCount),
        pageEnd: estimatePage(end, clean.length, input.pageCount),
        tokenEstimate: Math.round(content.length / 4),
      });
    }
    if (end >= clean.length) break;
    start = Math.max(end - OVERLAP_CHARS, end);
  }
  return chunks;
}