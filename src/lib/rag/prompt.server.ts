// Prompt assembly for RAG chat. Kept separate from ChatService so it can be
// tuned (few-shot, tone, guardrails) without touching wiring.
import type { RetrievedChunk } from "./types";
import { BracketCitationFormatter } from "./citations";

const SYSTEM_PROMPT = `You are PaperPal, a research assistant that helps a user understand a single academic paper.

Rules:
- Answer using ONLY the excerpts provided in the "Paper excerpts" section.
- Cite every non-trivial claim inline with bracketed numbers matching the excerpt IDs, e.g. "The model uses transformers [2]." Multiple citations look like "[1][3]".
- If the answer is not in the excerpts, say so briefly and suggest what the user could ask instead. Do NOT invent facts.
- Prefer clear, well-structured Markdown: short paragraphs, bullet lists, tables when comparing, fenced code blocks for code, and LaTeX (\\( … \\) inline, $$ … $$ block) for math.
- Match the user's requested depth (ELI15, technical, one paragraph, etc.).
- Never repeat the excerpts verbatim; summarize and synthesize.`;

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
  const systemMessage = `${SYSTEM_PROMPT}\n\n${header}\n\nPaper excerpts (cite by ID):\n\n${contextBlock || "(no excerpts retrieved — tell the user the paper text hasn't been indexed yet)"}`;
  return { systemMessage, citations };
}