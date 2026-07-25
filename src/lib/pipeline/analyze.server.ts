// AI analysis layer. Today this is heuristic/placeholder logic derived from the
// extracted text; swap the body of `analyzePaper` with a call to your LLM
// provider (e.g. Lovable AI Gateway) without changing any callers.
import type { KeyFinding, PaperAnalysis, PaperMetadata, PaperReference } from "./types";
import { extractReferences } from "./references.server";

const SECTION_HEADS = [
  "introduction",
  "background",
  "related work",
  "methods",
  "methodology",
  "materials and methods",
  "experiments",
  "results",
  "discussion",
  "findings",
  "conclusion",
  "conclusions",
  "references",
  "bibliography",
];

type Section = { name: string; body: string };

function splitSections(text: string): Section[] {
  const pattern = new RegExp(
    `\\n\\s*(?:\\d+\\.?\\s*)?(${SECTION_HEADS.join("|")})\\b[^\\n]*\\n`,
    "gi",
  );
  const sections: Section[] = [];
  const matches = [...text.matchAll(pattern)];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const next = matches[i + 1];
    const start = (m.index ?? 0) + m[0].length;
    const end = next?.index ?? text.length;
    sections.push({
      name: m[1].toLowerCase(),
      body: text.slice(start, end).trim(),
    });
  }
  return sections;
}

function pickSection(sections: Section[], names: string[]): string | null {
  for (const n of names) {
    const s = sections.find((sec) => sec.name === n);
    if (s && s.body.length > 40) return condense(s.body, 1600);
  }
  return null;
}

function condense(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

function sentenceSummary(text: string, maxSentences: number): string {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30 && s.length < 400);
  return sentences.slice(0, maxSentences).join(" ");
}

function extractKeyFindings(sections: Section[], fallback: string): KeyFinding[] {
  const source =
    pickSection(sections, ["results", "findings", "discussion"]) ?? fallback;
  const bullets = source
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40 && s.length < 300)
    .slice(0, 5);
  return bullets.map((b, i) => ({
    title: `Finding ${i + 1}`,
    description: b,
  }));
}

function extractReferencesFromText(text: string): PaperReference[] {
  const { entries } = extractReferences({ text, pageCount: null });
  return entries.slice(0, 200).map((e) => ({ index: e.index, raw: e.raw }));
}

function deriveTags(metadata: PaperMetadata): string[] {
  if (metadata.keywords.length) return metadata.keywords.slice(0, 8);
  return [];
}

export async function analyzePaper(input: {
  text: string;
  metadata: PaperMetadata;
}): Promise<PaperAnalysis> {
  const { text, metadata } = input;
  const sections = splitSections(text);

  const abstract = metadata.abstract ?? sentenceSummary(text, 4);
  const summary =
    abstract && abstract.length > 80
      ? condense(abstract, 1200)
      : sentenceSummary(text, 6) || "No summary available.";

  const methodology =
    pickSection(sections, ["methods", "methodology", "materials and methods", "experiments"]) ??
    "Methodology section not detected in this document.";

  const conclusions =
    pickSection(sections, ["conclusion", "conclusions", "discussion"]) ??
    "Conclusion section not detected in this document.";

  return {
    summary,
    keyFindings: extractKeyFindings(sections, summary),
    methodology,
    conclusions,
    references: extractReferencesFromText(text),
    tags: deriveTags(metadata),
  };
}