-- Idempotent restore for databases that applied an older 20260406202444_remote_schema.sql
-- which dropped name_search. Safe no-op if the column already exists.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS name_search tsvector
    GENERATED ALWAYS AS (
      to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(name_normalized, ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS cards_name_search_idx
  ON cards USING GIN(name_search);
