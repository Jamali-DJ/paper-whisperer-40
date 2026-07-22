
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE public.paper_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  paper_id UUID NOT NULL REFERENCES public.papers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  content JSONB,
  error_message TEXT,
  provider TEXT,
  model TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(paper_id, module_key)
);

CREATE INDEX idx_paper_analyses_paper_id ON public.paper_analyses(paper_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paper_analyses TO authenticated;
GRANT ALL ON public.paper_analyses TO service_role;

ALTER TABLE public.paper_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own analyses"
  ON public.paper_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analyses"
  ON public.paper_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analyses"
  ON public.paper_analyses FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analyses"
  ON public.paper_analyses FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER paper_analyses_set_updated_at
  BEFORE UPDATE ON public.paper_analyses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
