-- Provider-specific identifiers at the set level (mirrors card external_ids pattern).
ALTER TABLE public.sets
  ADD COLUMN external_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX sets_external_ids_idx ON public.sets USING gin (external_ids);
