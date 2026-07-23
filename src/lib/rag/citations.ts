// Isomorphic citation helpers. Safe to import from the client.
import type { Citation, RetrievedChunk } from "./types";

function pageLabel(c: { pageStart: number | null; pageEnd: number | null }): string {
  if (c.pageStart == null) return "";
  if (c.pageEnd == null || c.pageEnd === c.pageStart) return `p.${c.pageStart}`;
  return `p.${c.pageStart}–${c.pageEnd}`;
}

function snippet(text: string, max = 220): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

export class BracketCitationFormatter {
  format(chunks: RetrievedChunk[]) {
    const citations: Citation[] = chunks.map((c, i) => ({
      index: i + 1,
      chunkId: c.id,
      pageStart: c.pageStart,
      pageEnd: c.pageEnd,
      snippet: snippet(c.content),
    }));
    const contextBlock = chunks
      .map((c, i) => {
        const label = pageLabel(c);
        return `[${i + 1}]${label ? ` (${label})` : ""}\n${c.content.trim()}`;
      })
      .join("\n\n---\n\n");
    return { contextBlock, citations };
  }
}

export function citationLabel(c: Citation): string {
  if (c.pageStart == null) return `Chunk ${c.index}`;
  if (c.pageEnd == null || c.pageEnd === c.pageStart) return `Page ${c.pageStart}`;
  return `Pages ${c.pageStart}–${c.pageEnd}`;
}