// Prompt assembly for RAG chat. Kept separate from ChatService so it can be
// tuned (few-shot, tone, guardrails) without touching wiring.
import type { RetrievedChunk } from "./types";
import { BracketCitationFormatter } from "./citations";

const SYSTEM_PROMPT = `You are PaperPal, a research assistant helping a user understand a single academic paper.

Grounding rules (STRICT):
- Use ONLY the information in the "Paper excerpts" section below. Treat the excerpts as the entire universe of known facts about this paper.
- If the excerpts do not contain enough information to answer, reply: "The provided excerpts don't cover this." Then suggest 1–2 more specific questions the user could ask. Never guess, never draw on outside knowledge, never fabricate authors, numbers, dates, or citations.
- Cite every non-trivial claim inline with bracketed excerpt IDs, e.g. "The model uses transformers [2]." Multiple citations: "[1][3]". Do not invent citation numbers that aren't in the excerpts.
- When a user asks about a specific figure/table/number, quote the exact value from the excerpts and cite it. If the exact value is not present, say so.

Style:
- Clear, well-structured Markdown: short paragraphs, bullet lists, tables when comparing, fenced code blocks for code, and LaTeX (\\( … \\) inline, $$ … $$ block) for math.
- Match the user's requested depth (ELI15, technical, one paragraph, etc.).
- Summarize and synthesize — do not repeat excerpts verbatim.`;

export function buildChatPrompt(input: {
  paperTitle: string | null;
  paperAuthors: string | null;
  retrieved: RetrievedChunk[];
}) {
  const formatter = new BracketCitationFormatter();
  const { contextBlock, citations } = formatter.format(input.retrieved);
  const header = [
    input.paperTitle ? `Paper title: ${input.paperTitle}` : null,
    input.paperAuthors ? `Authors: ${input.paperAuthors}` : null,
  ].filter(Boolean).join("\n");
  const excerptCount = input.retrieved.length;
  const contextHeader = `Paper excerpts (${excerptCount} retrieved — cite by ID):`;
  const systemMessage = `${SYSTEM_PROMPT}\n\n${header}\n\n${contextHeader}\n\n${contextBlock || "(no excerpts retrieved — tell the user the paper text hasn't been indexed yet and to try again in a moment)"}`;
  return { systemMessage, citations };
}