-- Ensure sets.external_ids and its GIN index exist without modifying historical migrations.
ALTER TABLE public.sets
  ADD COLUMN IF NOT EXISTS external_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS sets_external_ids_idx ON public.sets USING gin (external_ids);
