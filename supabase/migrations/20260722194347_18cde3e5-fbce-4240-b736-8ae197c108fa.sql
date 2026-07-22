
-- Extend status enum with new pipeline stages
ALTER TYPE public.paper_status ADD VALUE IF NOT EXISTS 'extracting';
ALTER TYPE public.paper_status ADD VALUE IF NOT EXISTS 'analyzing';
ALTER TYPE public.paper_status ADD VALUE IF NOT EXISTS 'completed';

-- Extend papers with pipeline output fields
ALTER TABLE public.papers
  ADD COLUMN IF NOT EXISTS abstract text,
  ADD COLUMN IF NOT EXISTS page_count integer,
  ADD COLUMN IF NOT EXISTS keywords text[],
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS key_findings jsonb,
  ADD COLUMN IF NOT EXISTS methodology text,
  ADD COLUMN IF NOT EXISTS conclusions text,
  ADD COLUMN IF NOT EXISTS "references" jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS processing_progress integer NOT NULL DEFAULT 0;
