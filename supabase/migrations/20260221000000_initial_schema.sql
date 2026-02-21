-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  RiftSeer — initial schema                                              │
-- │  Apply via: supabase db push  (or paste into the Supabase SQL editor)   │
-- └─────────────────────────────────────────────────────────────────────────┘

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper: auto-update updated_at on any table that has the column.
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── sets ──────────────────────────────────────────────────────────────────────

CREATE TABLE sets (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  set_code       text        NOT NULL UNIQUE,
  set_name       text        NOT NULL,
  set_uri        text,
  set_search_uri text,
  card_count     integer,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER sets_updated_at
  BEFORE UPDATE ON sets
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE sets ENABLE ROW LEVEL SECURITY;

-- ── artists ───────────────────────────────────────────────────────────────────

CREATE TABLE artists (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE artists ENABLE ROW LEVEL SECURITY;

-- ── cards ─────────────────────────────────────────────────────────────────────

CREATE TABLE cards (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text        NOT NULL,
  -- Normalized name for fast exact-match lookup (lowercased, punctuation stripped).
  -- Populated by the ingest pipeline using normalizeCardName() from packages/core.
  name_normalized  text        NOT NULL,
  collector_number text,
  released_at      date,
  set_id           uuid        REFERENCES sets(id)    ON DELETE SET NULL,
  artist_id        uuid        REFERENCES artists(id) ON DELETE SET NULL,

  -- Nested data stored as JSONB to mirror the new Card schema.
  -- See packages/core/src/types.ts for shape documentation.
  external_ids     jsonb       NOT NULL DEFAULT '{}',  -- { riftcodex_id, riftbound_id, tcgplayer_id }
  attributes       jsonb       NOT NULL DEFAULT '{}',  -- { energy, might, power }
  classification   jsonb       NOT NULL DEFAULT '{}',  -- { type, supertype, rarity, tags, domain }
  text             jsonb       NOT NULL DEFAULT '{}',  -- { rich, plain, flavour }
  metadata         jsonb       NOT NULL DEFAULT '{}',  -- { finishes, signature, overnumbered, alternate_art }
  media            jsonb       NOT NULL DEFAULT '{}',  -- { orientation, accessibility_text, media_urls }
  purchase_uris    jsonb       NOT NULL DEFAULT '{}',  -- { cardmarket, tcgplayer }
  prices           jsonb       NOT NULL DEFAULT '{}',  -- { usd, usd_foil, eur, eur_foil }
  all_parts        jsonb       NOT NULL DEFAULT '[]',  -- RelatedCard[] for non-token cards
  used_by          jsonb       NOT NULL DEFAULT '[]',  -- RelatedCard[] for token cards

  is_token         boolean     NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  ingested_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER cards_updated_at
  BEFORE UPDATE ON cards
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

-- ── rulings ───────────────────────────────────────────────────────────────────

CREATE TABLE rulings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id     uuid        NOT NULL UNIQUE REFERENCES cards(id) ON DELETE CASCADE,
  rulings_uri text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rulings ENABLE ROW LEVEL SECURITY;

-- RLS is enabled with no per-table policies: all client access must use the
-- service role. Anon/auth roles have no SELECT/INSERT/UPDATE/DELETE and will
-- see no rows. See project README for service-role-only rationale.

-- ── indexes ───────────────────────────────────────────────────────────────────

-- FK traversal
CREATE INDEX cards_set_id_idx    ON cards (set_id);
CREATE INDEX cards_artist_id_idx ON cards (artist_id);

-- Primary search path: exact normalized name lookup
CREATE INDEX cards_name_normalized_idx ON cards (name_normalized);

-- Filtering tokens vs. non-tokens
CREATE INDEX cards_is_token_idx ON cards (is_token);
