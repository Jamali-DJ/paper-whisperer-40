// PDF text + metadata extraction. Server-only: uses unpdf which pulls in a
// Node-ish PDF worker, so it must never be reachable from client bundles.
import { extractText, getDocumentProxy, getMeta } from "unpdf";

import type { PaperMetadata } from "./types";

export type ExtractedPaper = {
  metadata: PaperMetadata;
  text: string;
};

function cleanAuthors(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s{2,}/g, " ");
}

function guessTitleFromText(text: string, fallback: string | null): string | null {
  const firstLines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 20);
  const candidate = firstLines.find(
    (l) => l.length >= 8 && l.length <= 200 && !/^abstract$/i.test(l),
  );
  return candidate ?? fallback;
}

function extractAbstract(text: string): string | null {
  const match = text.match(
    /\babstract\b[\s:—-]*([\s\S]{60,3500}?)(?:\n\s*\n|\b(?:1\.?\s*introduction|introduction|keywords)\b)/i,
  );
  if (!match) return null;
  return match[1].replace(/\s+/g, " ").trim();
}

function extractKeywords(text: string): string[] {
  const match = text.match(/\bkeywords?\b[\s:—-]*([^\n]{5,400})/i);
  if (!match) return [];
  return match[1]
    .split(/[,;•·]/)
    .map((k) => k.trim())
    .filter((k) => k.length > 1 && k.length < 60)
    .slice(0, 12);
}

export async function extractPaper(fileBytes: ArrayBuffer): Promise<ExtractedPaper> {
  const bytes = new Uint8Array(fileBytes);
  const pdf = await getDocumentProxy(bytes);

  const [{ text, totalPages }, metaRaw] = await Promise.all([
    extractText(pdf, { mergePages: true }),
    getMeta(pdf).catch(() => ({ info: {}, metadata: {} }) as { info: Record<string, unknown> }),
  ]);

  const info = (metaRaw?.info ?? {}) as Record<string, unknown>;
  const rawTitle =
    typeof info.Title === "string" && info.Title.trim() ? info.Title.trim() : null;
  const rawAuthors = typeof info.Author === "string" ? info.Author : null;

  const flatText = Array.isArray(text) ? text.join("\n") : String(text ?? "");

  return {
    text: flatText,
    metadata: {
      title: guessTitleFromText(flatText, rawTitle),
      authors: cleanAuthors(rawAuthors),
      abstract: extractAbstract(flatText),
      keywords: extractKeywords(flatText),
      pageCount: totalPages,
    },
  };
}