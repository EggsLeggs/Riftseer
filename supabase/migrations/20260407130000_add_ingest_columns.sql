-- Add set-level metadata columns populated by the ingest pipeline.
ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS published_on    date,
  ADD COLUMN IF NOT EXISTS is_promo        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_set_code text;

-- Add related_printings (other print/art versions of the same card).
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS related_printings jsonb NOT NULL DEFAULT '[]';
