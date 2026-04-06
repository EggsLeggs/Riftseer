-- Full-text search on card names (Postgres tsvector). Uses 'simple' config to avoid
-- stemming card names (e.g. "Shattered" → "shatter").

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS name_search tsvector
    GENERATED ALWAYS AS (
      to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(name_normalized, ''))
    ) STORED;

CREATE INDEX IF NOT EXISTS cards_name_search_idx
  ON cards USING GIN(name_search);
