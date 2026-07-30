-- Ingest rewrite Phase 1: card `source` column, admin override layer tables, and
-- ingest_card_data_v2 (adds a prune step + honours admin deletions).
--
-- The override tables give admins durable, reversible control over card data that
-- survives every ingest re-run. They are written only by the service role (RLS on,
-- no policies), same convention as the rest of the schema. They intentionally carry
-- NO foreign key to cards(id): a card may be pruned/re-created between runs, and an
-- override (or deletion) must persist across that so the admin edit is not lost.

-- ── cards.source ──────────────────────────────────────────────────────────────
-- 'riftcodex' = ingested from upstream (eligible for the ingest prune).
-- 'manual'    = created by an admin via manual_cards (never pruned).
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'riftcodex';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cards_source_check'
      AND conrelid = 'cards'::regclass
  ) THEN
    ALTER TABLE cards
      ADD CONSTRAINT cards_source_check CHECK (source IN ('riftcodex', 'manual'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS cards_source_idx ON cards (source);

-- ── card_overrides ────────────────────────────────────────────────────────────
-- JSON merge-patch overlaid on the ingested card in-worker before upsert.
CREATE TABLE IF NOT EXISTS card_overrides (
  card_id    text PRIMARY KEY,
  patch      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  note       text,
  edited_by  uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE card_overrides ENABLE ROW LEVEL SECURITY;

-- ── manual_cards ──────────────────────────────────────────────────────────────
-- Full card definitions for cards with no RiftCodex source; re-applied every ingest.
CREATE TABLE IF NOT EXISTS manual_cards (
  id         text PRIMARY KEY,
  definition jsonb       NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE manual_cards ENABLE ROW LEVEL SECURITY;

-- ── card_relationship_overrides ───────────────────────────────────────────────
-- Reversible manual link edits. `kind` is the RelatedCard bucket
-- (all_parts | used_by | related_champions | related_legends |
--  related_signatures | related_printings); `action` add|remove.
CREATE TABLE IF NOT EXISTS card_relationship_overrides (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id         text        NOT NULL,
  kind            text        NOT NULL,
  related_card_id text        NOT NULL,
  action          text        NOT NULL CHECK (action IN ('add', 'remove')),
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN (
    'all_parts',
    'used_by',
    'related_champions',
    'related_legends',
    'related_signatures',
    'related_printings'
  )),
  UNIQUE (card_id, kind, related_card_id, action)
);
ALTER TABLE card_relationship_overrides ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS card_relationship_overrides_card_id_idx
  ON card_relationship_overrides (card_id);

-- ── card_deletions ────────────────────────────────────────────────────────────
-- Admin deletions that persist even if RiftCodex still returns the card.
CREATE TABLE IF NOT EXISTS card_deletions (
  card_id    text        PRIMARY KEY,
  deleted_by uuid,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE card_deletions ENABLE ROW LEVEL SECURITY;

-- ── ingest_card_data_v2 ───────────────────────────────────────────────────────
-- Identical upsert to ingest_card_data (20260728000000) plus:
--   • persists cards.source (default 'riftcodex')
--   • PRUNE: delete source='riftcodex' cards whose id is not in p_valid_ids
--     (guarded against an empty payload so a failed upstream fetch cannot wipe
--     the table)
--   • honours card_deletions: any card_id there is removed after upsert
-- Overrides (patches / manual cards / relationship edits) are applied in-worker
-- before this RPC, so p_cards already holds the final values.
CREATE OR REPLACE FUNCTION ingest_card_data_v2(
  p_sets      jsonb,
  p_artists   jsonb,
  p_cards     jsonb,
  p_valid_ids jsonb
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_set_id_map    jsonb := '{}'::jsonb;
  v_artist_id_map jsonb := '{}'::jsonb;
  s jsonb;
  a jsonb;
  c jsonb;
BEGIN

  -- ── 1. Upsert sets ──────────────────────────────────────────────────────────
  FOR s IN SELECT * FROM jsonb_array_elements(p_sets)
  LOOP
    INSERT INTO sets (
      set_code, set_name, set_uri, set_search_uri,
      published_on, is_promo, parent_set_code, external_ids
    )
    VALUES (
      s->>'set_code',
      s->>'set_name',
      s->>'set_uri',
      s->>'set_search_uri',
      CASE
        WHEN NULLIF(s->>'published_on', '') ~ '^\d{4}-\d{2}-\d{2}'
          THEN left(s->>'published_on', 10)::date
        ELSE NULL
      END,
      coalesce((s->>'is_promo')::boolean, false),
      s->>'parent_set_code',
      coalesce(s->'external_ids', '{}'::jsonb)
    )
    ON CONFLICT (set_code) DO UPDATE SET
      set_name        = EXCLUDED.set_name,
      set_uri         = EXCLUDED.set_uri,
      set_search_uri  = EXCLUDED.set_search_uri,
      published_on    = EXCLUDED.published_on,
      is_promo        = EXCLUDED.is_promo,
      parent_set_code = EXCLUDED.parent_set_code,
      external_ids    = EXCLUDED.external_ids,
      updated_at      = now();
  END LOOP;

  SELECT jsonb_object_agg(set_code, id::text)
  INTO v_set_id_map
  FROM sets
  WHERE set_code IN (SELECT s2->>'set_code' FROM jsonb_array_elements(p_sets) s2);

  -- ── 2. Upsert artists ───────────────────────────────────────────────────────
  FOR a IN SELECT * FROM jsonb_array_elements(p_artists)
  LOOP
    INSERT INTO artists (name)
    VALUES (a->>'name')
    ON CONFLICT (name) DO NOTHING;
  END LOOP;

  SELECT jsonb_object_agg(name, id::text)
  INTO v_artist_id_map
  FROM artists
  WHERE name IN (SELECT a2->>'name' FROM jsonb_array_elements(p_artists) a2);

  -- ── 3. Upsert cards ─────────────────────────────────────────────────────────
  FOR c IN SELECT * FROM jsonb_array_elements(p_cards)
  LOOP
    -- Never (re)insert a card the admin has deleted.
    CONTINUE WHEN EXISTS (SELECT 1 FROM card_deletions d WHERE d.card_id = c->>'id');

    INSERT INTO cards (
      id, name, name_normalized, collector_number, released_at,
      set_id, artist_id,
      external_ids, attributes, classification, text, metadata, media,
      purchase_uris, prices,
      all_parts, used_by, related_champions, related_legends,
      related_signatures, related_printings,
      is_token, source, public_slug, ingested_at
    )
    VALUES (
      c->>'id',
      c->>'name',
      c->>'name_normalized',
      c->>'collector_number',
      CASE
        WHEN NULLIF(c->>'released_at', '') ~ '^\d{4}-\d{2}-\d{2}'
          THEN left(c->>'released_at', 10)::date
        ELSE NULL
      END,
      (v_set_id_map->>(c->>'set_code'))::uuid,
      (v_artist_id_map->>(c->>'artist'))::uuid,
      coalesce(c->'external_ids',       '{}'::jsonb),
      coalesce(c->'attributes',         '{}'::jsonb),
      coalesce(c->'classification',     '{}'::jsonb),
      coalesce(c->'text',               '{}'::jsonb),
      coalesce(c->'metadata',           '{}'::jsonb),
      coalesce(c->'media',              '{}'::jsonb),
      coalesce(c->'purchase_uris',      '{}'::jsonb),
      coalesce(c->'prices',             '{}'::jsonb),
      coalesce(c->'all_parts',          '[]'::jsonb),
      coalesce(c->'used_by',            '[]'::jsonb),
      coalesce(c->'related_champions',  '[]'::jsonb),
      coalesce(c->'related_legends',    '[]'::jsonb),
      coalesce(c->'related_signatures', '[]'::jsonb),
      coalesce(c->'related_printings',  '[]'::jsonb),
      coalesce((c->>'is_token')::boolean, false),
      coalesce(NULLIF(c->>'source', ''), 'riftcodex'),
      NULLIF(c->>'public_slug', ''),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
      public_slug        = coalesce(cards.public_slug, EXCLUDED.public_slug),
      name               = EXCLUDED.name,
      name_normalized    = EXCLUDED.name_normalized,
      collector_number   = EXCLUDED.collector_number,
      released_at        = EXCLUDED.released_at,
      set_id             = EXCLUDED.set_id,
      artist_id          = EXCLUDED.artist_id,
      external_ids       = EXCLUDED.external_ids,
      attributes         = EXCLUDED.attributes,
      classification     = EXCLUDED.classification,
      text               = EXCLUDED.text,
      metadata           = EXCLUDED.metadata,
      media              = EXCLUDED.media,
      purchase_uris      = EXCLUDED.purchase_uris,
      prices             = EXCLUDED.prices,
      all_parts          = EXCLUDED.all_parts,
      used_by            = EXCLUDED.used_by,
      related_champions  = EXCLUDED.related_champions,
      related_legends    = EXCLUDED.related_legends,
      related_signatures = EXCLUDED.related_signatures,
      related_printings  = EXCLUDED.related_printings,
      is_token           = EXCLUDED.is_token,
      source             = EXCLUDED.source,
      ingested_at        = EXCLUDED.ingested_at;
  END LOOP;

  -- ── 3b. Prune stale ingested cards ──────────────────────────────────────────
  -- Only when we actually have a valid-id set, so an empty/failed upstream fetch
  -- cannot delete the whole catalogue.
  IF jsonb_array_length(coalesce(p_valid_ids, '[]'::jsonb)) > 0 THEN
    DELETE FROM cards
    WHERE source = 'riftcodex'
      AND id NOT IN (SELECT jsonb_array_elements_text(p_valid_ids));
  END IF;

  -- ── 3c. Apply admin deletions ───────────────────────────────────────────────
  DELETE FROM cards
  WHERE id IN (SELECT card_id FROM card_deletions);

  -- ── 4. Refresh set card_count ───────────────────────────────────────────────
  WITH target_sets AS (
    SELECT s3->>'set_code' AS set_code
    FROM jsonb_array_elements(p_sets) s3
  ),
  set_counts AS (
    SELECT st.set_code, count(*)::int AS card_count
    FROM cards c2
    JOIN sets st ON st.id = c2.set_id
    JOIN target_sets ts ON ts.set_code = st.set_code
    GROUP BY st.set_code
  )
  UPDATE sets s
  SET card_count = coalesce(sc.card_count, 0)
  FROM target_sets ts
  LEFT JOIN set_counts sc ON sc.set_code = ts.set_code
  WHERE s.set_code = ts.set_code;

END;
$$;
