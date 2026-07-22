// Definitions for every AI analysis module rendered on the Paper Detail page.
// Adding a new module means: append an entry here, and both the server
// generator and the UI will pick it up automatically.

export type AnalysisModuleKey =
  | "executive_summary"
  | "plain_english_summary"
  | "technical_summary"
  | "key_findings"
  | "methodology_explained"
  | "strengths"
  | "limitations"
  | "future_research"
  | "glossary";

export type AnalysisModuleDef = {
  key: AnalysisModuleKey;
  title: string;
  description: string;
  /** Icon key resolved to a lucide component in the UI layer. */
  icon:
    | "sparkles"
    | "book"
    | "flask"
    | "target"
    | "microscope"
    | "trophy"
    | "alert"
    | "compass"
    | "glossary";
  /** System instruction sent to the AI provider for this module. */
  system: string;
  /** Estimated token budget; keeps expensive prompts bounded. */
  maxTokens: number;
};

const BASE_SYSTEM = `You are a research assistant that turns academic papers into clear, accurate analyses.
Always ground your answer in the provided paper text. If information is missing, say so briefly rather than guessing.
Return concise, well-formatted Markdown. Do not include preambles like "Sure" or "Here is". Do not repeat the module title.`;

function mk(
  key: AnalysisModuleKey,
  title: string,
  description: string,
  icon: AnalysisModuleDef["icon"],
  instruction: string,
  maxTokens = 700,
): AnalysisModuleDef {
  return {
    key,
    title,
    description,
    icon,
    system: `${BASE_SYSTEM}\n\n${instruction}`,
    maxTokens,
  };
}

export const ANALYSIS_MODULES: AnalysisModuleDef[] = [
  mk(
    "executive_summary",
    "Executive Summary",
    "One-paragraph decision-maker overview.",
    "sparkles",
    "Write a single tight paragraph (4–6 sentences) capturing the problem, approach, main result, and why it matters. Aim for a busy executive or PI reading between meetings.",
    500,
  ),
  mk(
    "plain_english_summary",
    "Plain English Summary",
    "Written for a curious non-expert.",
    "book",
    "Explain the paper as if to a smart high-school student. Avoid jargon; when a technical term is unavoidable, define it inline. Use short paragraphs and, when helpful, a short bulleted list.",
    700,
  ),
  mk(
    "technical_summary",
    "Technical Summary",
    "For domain experts — precise and dense.",
    "flask",
    "Write a technically precise summary for a domain expert. Include the specific methods, datasets, models, metrics, and quantitative results. Use exact terminology from the paper.",
    900,
  ),
  mk(
    "key_findings",
    "Key Findings",
    "The main results, one per bullet.",
    "target",
    "List the paper's key findings as Markdown bullet points. Each bullet: a short bold headline, then one sentence of explanation with concrete numbers when available. 3–7 bullets.",
    700,
  ),
  mk(
    "methodology_explained",
    "Methodology Explained",
    "How the study was actually run.",
    "microscope",
    "Explain the methodology step by step: data sources, study design, models or techniques, evaluation setup. Use a numbered list. Note any assumptions the authors made.",
    900,
  ),
  mk(
    "strengths",
    "Strengths",
    "What this paper does well.",
    "trophy",
    "List 3–6 concrete strengths of the paper as Markdown bullets. Focus on methodological rigor, novelty, clarity, reproducibility, or impact. Avoid generic praise.",
    500,
  ),
  mk(
    "limitations",
    "Limitations",
    "Caveats, gaps, and threats to validity.",
    "alert",
    "List 3–6 honest limitations as Markdown bullets. Include what the authors acknowledge and what an expert reviewer would additionally flag (sample size, generalizability, confounders, missing baselines).",
    600,
  ),
  mk(
    "future_research",
    "Future Research",
    "Open questions and next steps.",
    "compass",
    "Suggest 3–6 concrete future research directions as Markdown bullets. Each: a short bold headline and one sentence describing the experiment or extension.",
    600,
  ),
  mk(
    "glossary",
    "Technical Terms Glossary",
    "Key terms defined in plain language.",
    "glossary",
    "Extract the 6–12 most important technical terms from the paper. Return them as a Markdown definition list where each line is `**Term** — plain-language definition (1 sentence).` Order by importance.",
    800,
  ),
];

export const ANALYSIS_MODULE_KEYS = ANALYSIS_MODULES.map((m) => m.key);

export function getModule(key: string): AnalysisModuleDef | undefined {
  return ANALYSIS_MODULES.find((m) => m.key === key);
}