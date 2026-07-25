// Reference / citation detection for research papers.
//
// Detects:
//  - The bibliography section boundary (offset in the extracted text).
//  - Structured bibliography entries (numbered [1] / 1. and author–year styles).
//  - In-text citations across the body ([12], [3,5], (Smith, 2023),
//    (Smith et al., 2023; Doe 2020), superscript numbers).
//  - Links each in-text citation to a bibliography entry when possible.
//
// Server-only: pure text logic, no I/O. Safe to unit test in isolation.

import type { PaperReference } from "./types";

export type InTextCitation = {
  /** Character offset in the extracted text where the citation appears. */
  offset: number;
  /** Raw matched text ("[12]", "(Smith et al., 2023)", …). */
  raw: string;
  /** Estimated 1-based page number in the source PDF. */
  page: number | null;
  /** Bibliography entry indices this citation resolves to (1-based). */
  resolves: number[];
};

export type StructuredReference = PaperReference & {
  authors: string | null;
  year: number | null;
  title: string | null;
};

export type ReferenceExtraction = {
  /** Byte offset in the extracted text where the references section starts, or null. */
  referencesStart: number | null;
  /** Body-only text with the references block removed. */
  bodyText: string;
  /** Raw references section text (may be empty). */
  referencesText: string;
  /** Structured bibliography entries. */
  entries: StructuredReference[];
  /** In-text citations detected across the body. */
  inText: InTextCitation[];
};

// Heading patterns that mark the start of a references / bibliography section.
// Case-insensitive, tolerant of numbering ("6. References"), roman numerals,
// and trailing punctuation.
const REF_HEADING = new RegExp(
  String.raw`(^|\n)\s*(?:\d+\.?\s+|[ivx]+\.?\s+)?` +
    String.raw`(references|bibliography|works\s+cited|literature\s+cited|reference\s+list)` +
    String.raw`\s*:?\s*(?:\n|$)`,
  "i",
);

// Some papers have appendices, acknowledgements, or supplementary material
// AFTER references. Detect those so we stop the reference block cleanly.
const POST_REF_HEADING = new RegExp(
  String.raw`\n\s*(?:\d+\.?\s+|[ivx]+\.?\s+)?` +
    String.raw`(appendix|appendices|supplementary(?:\s+material)?|acknowledg(?:e)?ments?|` +
    String.raw`author\s+contributions|funding|conflicts?\s+of\s+interest|data\s+availability)` +
    String.raw`\b`,
  "i",
);

export function detectReferencesStart(text: string): number | null {
  // Prefer the LAST occurrence — many papers use the word "references" in the
  // body (e.g. "see references cited in…"), so the section head is usually
  // near the end of the document.
  let last: number | null = null;
  const matches = text.matchAll(new RegExp(REF_HEADING.source, "gi"));
  for (const m of matches) {
    const start = (m.index ?? 0) + (m[1]?.length ?? 0);
    last = start;
  }
  if (last == null) return null;
  // Ignore false positives that occur in the first 40% of the paper.
  if (last < text.length * 0.35) return null;
  return last;
}

function splitReferenceEntries(refText: string): string[] {
  const cleaned = refText.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];
  // Try numbered pattern first: "[1] …" / "1. …" / "1) …" at line start.
  const numbered = cleaned.split(
    /\n(?=\s*(?:\[\d{1,3}\]|\(\d{1,3}\)|\d{1,3}\.\s|\d{1,3}\)\s))/,
  );
  if (numbered.length >= 3) {
    return numbered.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
  }
  // Author-year fallback: split on blank lines, or on a line starting with a
  // capitalized surname followed by initials or a comma.
  const authorYear = cleaned.split(
    /\n\s*\n|\n(?=[A-Z][A-Za-z'’\-]+(?:,\s*[A-Z]\.| and | & ))/,
  );
  return authorYear
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 20 && s.length < 800);
}

function parseEntry(index: number, raw: string): StructuredReference {
  const clean = raw.replace(/^\s*(?:\[\d+\]|\(\d+\)|\d+[.)])\s*/, "").trim();
  const yearMatch = clean.match(/\b(19|20)\d{2}[a-z]?\b/);
  const year = yearMatch ? Number(yearMatch[0].slice(0, 4)) : null;
  // Authors = everything before the year, capped to a reasonable length.
  let authors: string | null = null;
  if (yearMatch && yearMatch.index != null && yearMatch.index > 0) {
    authors = clean
      .slice(0, yearMatch.index)
      .replace(/[.,;:\s]+$/, "")
      .trim();
    if (authors.length > 200) authors = null;
  }
  // Title: heuristic — first quoted or the sentence after the year.
  let title: string | null = null;
  const quoted = clean.match(/[“"']([^”"']{8,240})[”"']/);
  if (quoted) title = quoted[1].trim();
  else if (yearMatch && yearMatch.index != null) {
    const rest = clean.slice(yearMatch.index + yearMatch[0].length + 1);
    const sent = rest.match(/^[\s.:)-]*([^.]{8,240})\./);
    if (sent) title = sent[1].trim();
  }
  return { index, raw: clean, authors, year, title };
}

// Match numbered in-text citations: [12], [3, 5], [3-6], [3;5]
const NUMBERED_INTEXT = /\[(\d{1,3}(?:\s*[,;\-\u2013]\s*\d{1,3})*)\]/g;
// Match author-year: (Smith, 2023), (Smith et al., 2023), (Smith and Doe, 2023),
// (Smith 2023; Doe 2020)
const AUTHOR_YEAR_INTEXT =
  /\(([A-Z][A-Za-z'’\-]+(?:\s+(?:et\s+al\.?|and|&)\s+[A-Z][A-Za-z'’\-]+)?)(?:,\s*|\s+)((?:19|20)\d{2}[a-z]?)((?:\s*[;,]\s*(?:[A-Z][A-Za-z'’\-]+(?:\s+(?:et\s+al\.?|and|&)\s+[A-Z][A-Za-z'’\-]+)?)(?:,\s*|\s+)(?:19|20)\d{2}[a-z]?)*)\)/g;

function expandNumberRange(spec: string): number[] {
  const out = new Set<number>();
  for (const part of spec.split(/[,;]/)) {
    const range = part.trim().match(/^(\d{1,3})\s*[-\u2013]\s*(\d{1,3})$/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      for (let i = lo; i <= hi && i - lo < 30; i++) out.add(i);
      continue;
    }
    const n = Number(part.trim());
    if (Number.isFinite(n) && n > 0 && n < 1000) out.add(n);
  }
  return [...out];
}

function pageForOffset(
  offset: number,
  textLength: number,
  pageCount: number | null,
): number | null {
  if (!pageCount || pageCount <= 0 || textLength <= 0) return null;
  const ratio = Math.min(1, Math.max(0, offset / textLength));
  return Math.min(pageCount, Math.max(1, Math.round(ratio * pageCount) || 1));
}

function findAuthorYearEntry(
  entries: StructuredReference[],
  authorHead: string,
  year: number,
): number | null {
  const key = authorHead.toLowerCase().split(/\s+(?:et\s+al\.?|and|&)\s+/)[0];
  for (const e of entries) {
    if (e.year !== year) continue;
    const authors = (e.authors ?? e.raw).toLowerCase();
    if (authors.includes(key)) return e.index;
  }
  return null;
}

function scanInTextCitations(
  body: string,
  entries: StructuredReference[],
  totalLength: number,
  pageCount: number | null,
): InTextCitation[] {
  const out: InTextCitation[] = [];
  for (const m of body.matchAll(NUMBERED_INTEXT)) {
    const offset = m.index ?? 0;
    const nums = expandNumberRange(m[1]);
    // Filter out obvious non-citations like "[1]" that never appears in the
    // bibliography and refers to something else. Only keep hits that resolve.
    const resolves = entries.length
      ? nums.filter((n) => n >= 1 && n <= entries.length)
      : nums;
    if (resolves.length === 0 && entries.length > 0) continue;
    out.push({
      offset,
      raw: m[0],
      page: pageForOffset(offset, totalLength, pageCount),
      resolves,
    });
  }
  for (const m of body.matchAll(AUTHOR_YEAR_INTEXT)) {
    const offset = m.index ?? 0;
    const authorHead = m[1];
    const year = Number(m[2]);
    const resolved: number[] = [];
    const primary = findAuthorYearEntry(entries, authorHead, year);
    if (primary) resolved.push(primary);
    out.push({
      offset,
      raw: m[0],
      page: pageForOffset(offset, totalLength, pageCount),
      resolves: resolved,
    });
  }
  out.sort((a, b) => a.offset - b.offset);
  return out.slice(0, 2000);
}

export function extractReferences(input: {
  text: string;
  pageCount: number | null;
}): ReferenceExtraction {
  const text = input.text ?? "";
  const total = text.length;
  const start = detectReferencesStart(text);

  let bodyText = text;
  let refText = "";
  if (start != null) {
    bodyText = text.slice(0, start).trimEnd();
    let tail = text.slice(start);
    // Trim trailing appendix/acknowledgements if they appear AFTER the refs.
    const postMatch = tail.match(POST_REF_HEADING);
    if (postMatch && postMatch.index != null && postMatch.index > 400) {
      tail = tail.slice(0, postMatch.index);
    }
    // Drop the heading line itself before splitting.
    refText = tail.replace(REF_HEADING, "\n").trim();
  }

  const rawEntries = splitReferenceEntries(refText);
  const entries = rawEntries.slice(0, 300).map((raw, i) => parseEntry(i + 1, raw));
  const inText = scanInTextCitations(bodyText, entries, total, input.pageCount);

  return {
    referencesStart: start,
    bodyText,
    referencesText: refText,
    entries,
    inText,
  };
}
