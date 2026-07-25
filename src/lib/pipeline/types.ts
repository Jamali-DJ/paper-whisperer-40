// Shared, isomorphic types for the paper processing pipeline.

export type PaperStatus =
  | "uploading"
  | "extracting"
  | "analyzing"
  | "completed"
  | "failed"
  // legacy values kept for rows created before the pipeline refactor
  | "processing"
  | "ready";

export const PIPELINE_STAGES: readonly PaperStatus[] = [
  "uploading",
  "extracting",
  "analyzing",
  "completed",
] as const;

export const STAGE_LABELS: Record<PaperStatus, string> = {
  uploading: "Uploading",
  extracting: "Extracting text",
  analyzing: "Analyzing",
  completed: "Completed",
  failed: "Failed",
  processing: "Analyzing",
  ready: "Completed",
};

export const STAGE_PROGRESS: Record<PaperStatus, number> = {
  uploading: 15,
  extracting: 40,
  analyzing: 70,
  completed: 100,
  failed: 100,
  processing: 55,
  ready: 100,
};

export type PaperMetadata = {
  title: string | null;
  authors: string | null;
  abstract: string | null;
  keywords: string[];
  pageCount: number;
};

export type KeyFinding = {
  title: string;
  description: string;
};

export type PaperReference = {
  index: number;
  raw: string;
};

export type PaperAnalysis = {
  summary: string;
  keyFindings: KeyFinding[];
  methodology: string | null;
  conclusions: string | null;
  references: PaperReference[];
  tags: string[];
};