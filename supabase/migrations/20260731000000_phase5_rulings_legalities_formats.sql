-- Ingest rewrite Phase 5: oracle grouping, formats, legalities and rulings.
--
-- Rulings and format legalities describe a *card*, not a printing, so they hang
-- off `cards.oracle_key` — a name-derived key shared by every printing. Each can
-- still be narrowed to a single printing when a variant genuinely differs.
--
-- Read precedence for legality is: printing override → oracle row → default
-- `legal`. Only non-legal statuses are stored at the oracle level, so an absent
-- row means legal and the tables stay small.
--
-- Everything here is service-role-only (RLS enabled, no policies), matching the
-- rest of the schema. The API gates admin callers on ADMIN_USER_IDS before any
-- of these functions is reached.

-- ── card_oracle_key ───────────────────────────────────────────────────────────
-- SQL mirror of `oracleKeyForName` in packages/types/src/oracle.ts. TypeScript
-- remains the authority: ingest stamps `cards.oracle_key` on every upsert and
-- the admin API sends it whenever a name changes. This copy exists for the
-- backfill below and as the fallback used by the RPCs, so a row that has not yet
-- been stamped still resolves to the right oracle group.
--
-- Kept deliberately in lockstep with the TS version:
--   • take the first face (before "//")
--   • strip every trailing parenthetical
--   • lowercase, drop apostrophes, hyphens → spaces, drop non-word characters,
--     collapse whitespace
CREATE OR REPLACE FUNCTION card_oracle_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        replace(
          regexp_replace(
            lower(
              btrim(
                regexp_replace(
                  btrim(split_part(coalesce(p_name, ''), '//', 1)),
                  '(\s*\([^)]*\)\s*)+$',
                  ''
                )
              )
            ),
            '[''’]', '', 'g'
          ),
          '-', ' '
        ),
        '[^a-z0-9_[:space:]]', '', 'g'
      ),
      '\s+', ' ', 'g'
    )
  );
$$;

-- ── cards.oracle_key ──────────────────────────────────────────────────────────
-- Nullable: `admin_create_manual_card` seeds a bare row before applying its
-- definition, and legacy rows predate this column. Every read path coalesces
-- through card_oracle_key(name), so a null is never a correctness problem.
ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS oracle_key text;

UPDATE cards
SET oracle_key = card_oracle_key(name)
WHERE oracle_key IS NULL;

CREATE INDEX IF NOT EXISTS cards_oracle_key_idx ON cards (oracle_key);

-- ── formats ───────────────────────────────────────────────────────────────────
-- System-wide play formats under admin CRUD. `active = false` retires a format
-- from public responses without discarding the legality rows attached to it.
CREATE TABLE IF NOT EXISTS formats (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code       text        NOT NULL UNIQUE,
  name       text        NOT NULL,
  sort_order integer     NOT NULL DEFAULT 0,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT formats_code_check CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$')
);
ALTER TABLE formats ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS formats_updated_at ON formats;
CREATE TRIGGER formats_updated_at
  BEFORE UPDATE ON formats
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Display order is (sort_order, name); the index serves the common listing.
CREATE INDEX IF NOT EXISTS formats_order_idx ON formats (sort_order, name);

-- ── card_legalities ───────────────────────────────────────────────────────────
-- Oracle-level status, shared by every printing of the card. Absence = legal, so
-- setting a format back to legal deletes the row rather than storing 'legal'.
CREATE TABLE IF NOT EXISTS card_legalities (
  oracle_key text        NOT NULL,
  format_id  uuid        NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  status     text        NOT NULL CHECK (status IN ('legal', 'not_legal', 'banned')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (oracle_key, format_id)
);
ALTER TABLE card_legalities ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS card_legalities_format_idx
  ON card_legalities (format_id);

-- ── card_legality_overrides ───────────────────────────────────────────────────
-- Per-printing exception to the oracle status. Unlike the oracle table an
-- explicit 'legal' *is* meaningful here: it exempts one printing from a
-- card-wide ban. No FK to cards(id) — like every other override table, a row
-- must survive its card being pruned and later re-ingested.
CREATE TABLE IF NOT EXISTS card_legality_overrides (
  card_id    text        NOT NULL,
  format_id  uuid        NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  status     text        NOT NULL CHECK (status IN ('legal', 'not_legal', 'banned')),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (card_id, format_id)
);
ALTER TABLE card_legality_overrides ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS card_legality_overrides_format_idx
  ON card_legality_overrides (format_id);

-- ── card_rulings ──────────────────────────────────────────────────────────────
-- Replaces the minimal `rulings` table (one nullable URI per card) with real
-- rulings and editorial notes. `card_id IS NULL` applies the entry to every
-- printing in the oracle group; a set `card_id` scopes it to that printing.
CREATE TABLE IF NOT EXISTS card_rulings (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  oracle_key text        NOT NULL,
  card_id    text,
  type       text        NOT NULL CHECK (type IN ('ruling', 'note')),
  text       text        NOT NULL CHECK (btrim(text) <> ''),
  dated      date,
  source     text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE card_rulings ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS card_rulings_updated_at ON card_rulings;
CREATE TRIGGER card_rulings_updated_at
  BEFORE UPDATE ON card_rulings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS card_rulings_oracle_key_idx
  ON card_rulings (oracle_key, created_at);
CREATE INDEX IF NOT EXISTS card_rulings_card_id_idx
  ON card_rulings (card_id)
  WHERE card_id IS NOT NULL;

-- ── Retire the legacy rulings table ───────────────────────────────────────────
-- Carry any stored `rulings_uri` across as a ruling whose provenance is that
-- URI, then drop the table and the now-dangling cards.rulings_id column. Ingest
-- never populated either, so in practice this moves zero rows.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'rulings'
  ) THEN
    INSERT INTO card_rulings (oracle_key, card_id, type, text, source, created_at)
    SELECT
      coalesce(c.oracle_key, card_oracle_key(c.name)),
      r.card_id,
      'ruling',
      'Imported from the legacy rulings table.',
      r.rulings_uri,
      r.created_at
    FROM rulings r
    JOIN cards c ON c.id = r.card_id
    WHERE NULLIF(btrim(r.rulings_uri), '') IS NOT NULL;
  END IF;
END;
$$;

ALTER TABLE cards DROP COLUMN IF EXISTS rulings_id;
DROP TABLE IF EXISTS rulings;

-- ── ingest_card_data_v2 ───────────────────────────────────────────────────────
-- Unchanged from 20260729000000 except that cards.oracle_key is now persisted
-- from the worker payload (falling back to the SQL mirror when a payload omits
-- it, so a card can never land without an oracle group).
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
      id, name, name_normalized, oracle_key, collector_number, released_at,
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
      coalesce(NULLIF(c->>'oracle_key', ''), card_oracle_key(c->>'name')),
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
      oracle_key         = EXCLUDED.oracle_key,
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

-- ── admin__apply_card_patch ───────────────────────────────────────────────────
-- Extends the Phase 3 definition with `oracle_key`. Like `name_normalized`, it
-- is NOT derived here: a caller that changes `name` must send `oracle_key` too,
-- computed with oracleKeyForName() from @riftseer/types/oracle, so the
-- derivation lives in exactly one place.
CREATE OR REPLACE FUNCTION admin__apply_card_patch(p_card_id text, p_patch jsonb)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_set_code      text;
  v_set_id        uuid;
  v_touch_set     boolean := false;
  v_artist_name   text;
  v_artist_id     uuid;
  v_touch_artist  boolean := false;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;

  -- Serialize all mutations for one card. Without the row lock, a concurrent
  -- delete could commit between this existence check and the UPDATE below,
  -- leaving a durable override for a live change that never happened.
  PERFORM 1 FROM cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- `set` arrives as the nested Card.set object; only set_code selects the FK.
  IF p_patch #> '{set,set_code}' IS NOT NULL THEN
    v_set_code := p_patch #>> '{set,set_code}';
    -- Hold a key-share lock until the card update has established its FK so a
    -- concurrent empty-set deletion cannot remove the destination underneath us.
    SELECT id
    INTO v_set_id
    FROM sets
    WHERE set_code = v_set_code
    FOR KEY SHARE;
    IF v_set_id IS NULL THEN
      RAISE EXCEPTION 'unknown set_code: %', v_set_code;
    END IF;
    v_touch_set := true;
  END IF;

  IF p_patch ? 'artist' THEN
    v_artist_name := NULLIF(p_patch->>'artist', '');
    v_artist_id := admin__resolve_artist(v_artist_name);
    v_touch_artist := true;
  END IF;

  UPDATE cards SET
    name = CASE WHEN p_patch ? 'name'
      THEN p_patch->>'name' ELSE name END,
    name_normalized = CASE WHEN p_patch ? 'name_normalized'
      THEN p_patch->>'name_normalized' ELSE name_normalized END,
    oracle_key = CASE WHEN p_patch ? 'oracle_key'
      THEN NULLIF(p_patch->>'oracle_key', '') ELSE oracle_key END,
    collector_number = CASE WHEN p_patch ? 'collector_number'
      THEN NULLIF(p_patch->>'collector_number', '') ELSE collector_number END,
    released_at = CASE WHEN p_patch ? 'released_at' THEN (
      CASE WHEN NULLIF(p_patch->>'released_at', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(p_patch->>'released_at', 10)::date
        ELSE NULL
      END
    ) ELSE released_at END,
    is_token = CASE WHEN p_patch ? 'is_token'
      THEN coalesce((p_patch->>'is_token')::boolean, false) ELSE is_token END,
    public_slug = CASE WHEN p_patch ? 'public_slug'
      THEN NULLIF(p_patch->>'public_slug', '') ELSE public_slug END,
    set_id    = CASE WHEN v_touch_set    THEN v_set_id    ELSE set_id    END,
    artist_id = CASE WHEN v_touch_artist THEN v_artist_id ELSE artist_id END,

    -- Deep-merged jsonb groups.
    external_ids = CASE WHEN p_patch ? 'external_ids'
      THEN coalesce(
        nullif(jsonb_merge_patch(external_ids, p_patch->'external_ids'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE external_ids END,
    attributes = CASE WHEN p_patch ? 'attributes'
      THEN coalesce(
        nullif(jsonb_merge_patch(attributes, p_patch->'attributes'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE attributes END,
    classification = CASE WHEN p_patch ? 'classification'
      THEN coalesce(
        nullif(jsonb_merge_patch(classification, p_patch->'classification'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE classification END,
    text = CASE WHEN p_patch ? 'text'
      THEN coalesce(
        nullif(jsonb_merge_patch(text, p_patch->'text'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE text END,
    metadata = CASE WHEN p_patch ? 'metadata'
      THEN coalesce(
        nullif(jsonb_merge_patch(metadata, p_patch->'metadata'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE metadata END,
    media = CASE WHEN p_patch ? 'media'
      THEN coalesce(
        nullif(jsonb_merge_patch(media, p_patch->'media'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE media END,
    purchase_uris = CASE WHEN p_patch ? 'purchase_uris'
      THEN coalesce(
        nullif(jsonb_merge_patch(purchase_uris, p_patch->'purchase_uris'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE purchase_uris END,
    prices = CASE WHEN p_patch ? 'prices'
      THEN coalesce(
        nullif(jsonb_merge_patch(prices, p_patch->'prices'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE prices END,

    -- Relationship arrays are replaced, not merged.
    all_parts = CASE WHEN jsonb_typeof(p_patch->'all_parts') = 'array'
      THEN p_patch->'all_parts' ELSE all_parts END,
    used_by = CASE WHEN jsonb_typeof(p_patch->'used_by') = 'array'
      THEN p_patch->'used_by' ELSE used_by END,
    related_champions = CASE WHEN jsonb_typeof(p_patch->'related_champions') = 'array'
      THEN p_patch->'related_champions' ELSE related_champions END,
    related_legends = CASE WHEN jsonb_typeof(p_patch->'related_legends') = 'array'
      THEN p_patch->'related_legends' ELSE related_legends END,
    related_signatures = CASE WHEN jsonb_typeof(p_patch->'related_signatures') = 'array'
      THEN p_patch->'related_signatures' ELSE related_signatures END,
    related_printings = CASE WHEN jsonb_typeof(p_patch->'related_printings') = 'array'
      THEN p_patch->'related_printings' ELSE related_printings END
  WHERE id = p_card_id;

  RETURN true;
END;
$$;

-- ── admin__format_json ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin__format_json(p_format formats)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'object',     'format',
    'id',         p_format.id,
    'code',       p_format.code,
    'name',       p_format.name,
    'sort_order', p_format.sort_order,
    'active',     p_format.active
  );
$$;

-- ── admin_create_format ───────────────────────────────────────────────────────
-- `sort_order` defaults to the end of the list so a new format never silently
-- displaces an existing one.
CREATE OR REPLACE FUNCTION admin_create_format(
  p_code       text,
  p_name       text,
  p_sort_order integer,
  p_active     boolean,
  p_actor      uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code   text;
  v_name   text;
  v_order  integer;
  v_format formats;
BEGIN
  v_code := lower(NULLIF(btrim(p_code), ''));
  v_name := NULLIF(btrim(p_name), '');
  IF v_code IS NULL OR v_name IS NULL THEN
    RAISE EXCEPTION 'format requires a code and a name';
  END IF;
  IF v_code !~ '^[a-z0-9][a-z0-9_-]*$' THEN
    RAISE EXCEPTION 'format code must be lowercase alphanumeric with - or _';
  END IF;

  IF EXISTS (SELECT 1 FROM formats WHERE code = v_code) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_exists');
  END IF;

  v_order := coalesce(
    p_sort_order,
    (SELECT coalesce(max(sort_order), 0) + 1 FROM formats)
  );

  INSERT INTO formats (code, name, sort_order, active)
  VALUES (v_code, v_name, v_order, coalesce(p_active, true))
  RETURNING * INTO v_format;

  PERFORM admin__log(
    p_actor, 'format.create', 'format', v_code, admin__format_json(v_format)
  );

  RETURN jsonb_build_object('ok', true, 'format', admin__format_json(v_format));
END;
$$;

-- ── admin_patch_format ────────────────────────────────────────────────────────
-- Patch keys: name, sort_order, active. `code` is immutable — legality and
-- ruling rows are keyed on the format id, but the code is the public handle and
-- renaming it would break saved links and API clients.
CREATE OR REPLACE FUNCTION admin_patch_format(
  p_code  text,
  p_patch jsonb,
  p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code   text;
  v_format formats;
BEGIN
  v_code := lower(NULLIF(btrim(p_code), ''));
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'code must not be empty';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;
  IF p_patch ? 'name' AND NULLIF(btrim(p_patch->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'name must not be empty';
  END IF;

  UPDATE formats SET
    name = CASE WHEN p_patch ? 'name'
      THEN btrim(p_patch->>'name') ELSE name END,
    sort_order = CASE WHEN p_patch ? 'sort_order'
      THEN coalesce((p_patch->>'sort_order')::integer, sort_order) ELSE sort_order END,
    active = CASE WHEN p_patch ? 'active'
      THEN coalesce((p_patch->>'active')::boolean, active) ELSE active END
  WHERE code = v_code
  RETURNING * INTO v_format;

  IF v_format.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;

  PERFORM admin__log(p_actor, 'format.patch', 'format', v_code, p_patch);

  RETURN jsonb_build_object('ok', true, 'format', admin__format_json(v_format));
END;
$$;

-- ── admin_delete_format ───────────────────────────────────────────────────────
-- Deleting a format discards every legality row that referenced it (ON DELETE
-- CASCADE). The counts come back in the response so the UI can warn first and
-- the audit entry records what was lost.
CREATE OR REPLACE FUNCTION admin_delete_format(
  p_code  text,
  p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code           text;
  v_format_id      uuid;
  v_oracle_count   integer;
  v_override_count integer;
BEGIN
  v_code := lower(NULLIF(btrim(p_code), ''));
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'code must not be empty';
  END IF;

  -- Lock before counting so a concurrent legality write cannot land between the
  -- count and the cascade, under-reporting what the delete destroyed.
  SELECT id INTO v_format_id FROM formats WHERE code = v_code FOR UPDATE;
  IF v_format_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;

  SELECT count(*) INTO v_oracle_count
  FROM card_legalities WHERE format_id = v_format_id;
  SELECT count(*) INTO v_override_count
  FROM card_legality_overrides WHERE format_id = v_format_id;

  DELETE FROM formats WHERE id = v_format_id;

  PERFORM admin__log(
    p_actor, 'format.delete', 'format', v_code,
    jsonb_build_object(
      'legalities_removed', v_oracle_count,
      'overrides_removed',  v_override_count
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'code', v_code,
    'legalities_removed', v_oracle_count,
    'overrides_removed', v_override_count
  );
END;
$$;

-- ── admin_reorder_formats ─────────────────────────────────────────────────────
-- `p_codes` is the complete desired order; each format's sort_order becomes its
-- position. Every code must exist, so a stale UI list fails loudly instead of
-- silently reordering a subset.
CREATE OR REPLACE FUNCTION admin_reorder_formats(
  p_codes jsonb,
  p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_missing text;
BEGIN
  IF jsonb_typeof(coalesce(p_codes, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'codes must be a JSON array';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements_text(coalesce(p_codes, '[]'::jsonb)) e
    GROUP BY lower(btrim(e))
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'codes must be unique';
  END IF;

  SELECT lower(btrim(e))
  INTO v_missing
  FROM jsonb_array_elements_text(coalesce(p_codes, '[]'::jsonb)) e
  WHERE NOT EXISTS (
    SELECT 1 FROM formats f WHERE f.code = lower(btrim(e))
  )
  LIMIT 1;
  IF v_missing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;

  UPDATE formats f
  SET sort_order = ordered.position
  FROM (
    SELECT lower(btrim(value)) AS code, (ordinality - 1)::integer AS position
    FROM jsonb_array_elements_text(coalesce(p_codes, '[]'::jsonb))
      WITH ORDINALITY AS t(value, ordinality)
  ) ordered
  WHERE f.code = ordered.code
    AND f.sort_order IS DISTINCT FROM ordered.position;

  PERFORM admin__log(
    p_actor, 'format.reorder', 'format', NULL,
    jsonb_build_object('codes', coalesce(p_codes, '[]'::jsonb))
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── admin__card_oracle_key ────────────────────────────────────────────────────
-- Resolve the oracle group for a live card, falling back to the SQL mirror for a
-- row that predates the column. Returns NULL when the card does not exist.
CREATE OR REPLACE FUNCTION admin__card_oracle_key(p_card_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT coalesce(c.oracle_key, card_oracle_key(c.name))
  FROM cards c
  WHERE c.id = p_card_id;
$$;

-- ── admin_set_card_legality ───────────────────────────────────────────────────
-- Set (or clear) one card's status in one format.
--
--   p_all_printings = true  → write the oracle row shared by every printing, and
--                             clear per-printing overrides for this format in
--                             the whole oracle group, so "apply to all
--                             printings" genuinely applies to all of them.
--   p_all_printings = false → write only this printing's override.
--
-- p_status NULL means "back to default": the corresponding row is deleted. At
-- oracle level 'legal' is also stored as a deletion, because absence *is* legal
-- and keeping explicit 'legal' rows would just grow the table. A printing-level
-- 'legal' is kept: it is how one printing is exempted from a card-wide ban.
CREATE OR REPLACE FUNCTION admin_set_card_legality(
  p_card_id       text,
  p_format_code   text,
  p_status        text,
  p_all_printings boolean,
  p_actor         uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code      text;
  v_format_id uuid;
  v_oracle    text;
  v_scope     text;
  v_all       boolean := coalesce(p_all_printings, false);
BEGIN
  v_code := lower(NULLIF(btrim(p_format_code), ''));
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'format_code must not be empty';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('legal', 'not_legal', 'banned') THEN
    RAISE EXCEPTION 'invalid legality status: %', p_status;
  END IF;

  SELECT id INTO v_format_id FROM formats WHERE code = v_code;
  IF v_format_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;

  -- Serialize against concurrent edits to the same card, and confirm it exists
  -- before writing a legality row that would reference nothing.
  PERFORM 1 FROM cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;
  v_oracle := admin__card_oracle_key(p_card_id);

  IF v_all THEN
    v_scope := 'oracle';

    -- A card-wide status must not be quietly contradicted by a leftover
    -- per-printing override, so clear them across the group. The coalesce
    -- matches admin__card_oracle_key so a sibling whose column is still null is
    -- not silently left holding an override.
    DELETE FROM card_legality_overrides o
    WHERE o.format_id = v_format_id
      AND (
        o.card_id = p_card_id
        OR o.card_id IN (
          SELECT c.id
          FROM cards c
          WHERE coalesce(c.oracle_key, card_oracle_key(c.name)) = v_oracle
        )
      );

    IF p_status IS NULL OR p_status = 'legal' THEN
      DELETE FROM card_legalities
      WHERE oracle_key = v_oracle AND format_id = v_format_id;
    ELSE
      INSERT INTO card_legalities (oracle_key, format_id, status, updated_by, updated_at)
      VALUES (v_oracle, v_format_id, p_status, p_actor, now())
      ON CONFLICT (oracle_key, format_id) DO UPDATE SET
        status     = EXCLUDED.status,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
    END IF;
  ELSE
    v_scope := 'printing';

    IF p_status IS NULL THEN
      DELETE FROM card_legality_overrides
      WHERE card_id = p_card_id AND format_id = v_format_id;
    ELSE
      INSERT INTO card_legality_overrides
        (card_id, format_id, status, updated_by, updated_at)
      VALUES (p_card_id, v_format_id, p_status, p_actor, now())
      ON CONFLICT (card_id, format_id) DO UPDATE SET
        status     = EXCLUDED.status,
        updated_by = EXCLUDED.updated_by,
        updated_at = now();
    END IF;
  END IF;

  PERFORM admin__log(
    p_actor, 'card.legality', 'card', p_card_id,
    jsonb_strip_nulls(jsonb_build_object(
      'format_code', v_code,
      'status',      p_status,
      'scope',       v_scope,
      'oracle_key',  v_oracle
    ))
  );

  RETURN jsonb_build_object(
    'ok', true,
    'card_id', p_card_id,
    'format_code', v_code,
    'scope', v_scope,
    'status', p_status
  );
END;
$$;

-- ── admin_create_card_ruling ──────────────────────────────────────────────────
-- `p_all_printings = true` stores card_id NULL, so the entry is inherited by
-- every printing in the oracle group.
CREATE OR REPLACE FUNCTION admin_create_card_ruling(
  p_card_id       text,
  p_all_printings boolean,
  p_type          text,
  p_text          text,
  p_dated         date,
  p_source        text,
  p_actor         uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_oracle text;
  v_text   text;
  v_id     uuid;
BEGIN
  IF p_type NOT IN ('ruling', 'note') THEN
    RAISE EXCEPTION 'invalid ruling type: %', p_type;
  END IF;
  v_text := NULLIF(btrim(p_text), '');
  IF v_text IS NULL THEN
    RAISE EXCEPTION 'ruling text must not be empty';
  END IF;

  PERFORM 1 FROM cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;
  v_oracle := admin__card_oracle_key(p_card_id);

  INSERT INTO card_rulings
    (oracle_key, card_id, type, text, dated, source, created_by)
  VALUES (
    v_oracle,
    CASE WHEN coalesce(p_all_printings, false) THEN NULL ELSE p_card_id END,
    p_type,
    v_text,
    p_dated,
    NULLIF(btrim(p_source), ''),
    p_actor
  )
  RETURNING id INTO v_id;

  PERFORM admin__log(
    p_actor, 'card.ruling.create', 'card', p_card_id,
    jsonb_strip_nulls(jsonb_build_object(
      'ruling_id',      v_id,
      'oracle_key',     v_oracle,
      'all_printings',  coalesce(p_all_printings, false),
      'type',           p_type,
      'text',           v_text,
      'dated',          p_dated,
      'source',         NULLIF(btrim(p_source), '')
    ))
  );

  RETURN jsonb_build_object('ok', true, 'ruling_id', v_id, 'card_id', p_card_id);
END;
$$;

-- ── admin_patch_card_ruling ───────────────────────────────────────────────────
-- Patch keys: type, text, dated, source, all_printings. `all_printings` retargets
-- the entry between the whole oracle group and this one printing.
--
-- Both this and the delete below take the card the caller reached the ruling
-- through, and refuse a ruling from a different oracle group. Rulings are keyed
-- by oracle group, not owned by a printing, so without that check a mistyped
-- card id in the URL would happily edit an unrelated card's ruling.
CREATE OR REPLACE FUNCTION admin_patch_card_ruling(
  p_card_id   text,
  p_ruling_id uuid,
  p_patch     jsonb,
  p_actor     uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ruling  card_rulings;
  v_oracle  text;
  v_card_id text;
  v_text    text;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;
  IF p_patch ? 'type' AND p_patch->>'type' NOT IN ('ruling', 'note') THEN
    RAISE EXCEPTION 'invalid ruling type: %', p_patch->>'type';
  END IF;
  IF p_patch ? 'text' AND NULLIF(btrim(p_patch->>'text'), '') IS NULL THEN
    RAISE EXCEPTION 'ruling text must not be empty';
  END IF;

  v_oracle := admin__card_oracle_key(p_card_id);
  IF v_oracle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;

  SELECT * INTO v_ruling
  FROM card_rulings
  WHERE id = p_ruling_id AND oracle_key = v_oracle
  FOR UPDATE;
  IF v_ruling.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ruling_not_found');
  END IF;

  v_card_id := v_ruling.card_id;
  IF p_patch ? 'all_printings' THEN
    v_card_id := CASE
      WHEN coalesce((p_patch->>'all_printings')::boolean, false) THEN NULL
      ELSE p_card_id
    END;
  END IF;

  v_text := CASE
    WHEN p_patch ? 'text' THEN btrim(p_patch->>'text')
    ELSE v_ruling.text
  END;

  UPDATE card_rulings SET
    card_id = v_card_id,
    type    = coalesce(NULLIF(p_patch->>'type', ''), type),
    text    = v_text,
    dated   = CASE WHEN p_patch ? 'dated' THEN (
      CASE WHEN NULLIF(p_patch->>'dated', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(p_patch->>'dated', 10)::date
        ELSE NULL
      END
    ) ELSE dated END,
    source  = CASE WHEN p_patch ? 'source'
      THEN NULLIF(btrim(p_patch->>'source'), '') ELSE source END
  WHERE id = p_ruling_id;

  PERFORM admin__log(
    p_actor, 'card.ruling.patch', 'card_ruling', p_ruling_id::text,
    p_patch || jsonb_build_object('card_id', p_card_id)
  );

  RETURN jsonb_build_object('ok', true, 'ruling_id', p_ruling_id);
END;
$$;

-- ── admin_delete_card_ruling ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_delete_card_ruling(
  p_card_id   text,
  p_ruling_id uuid,
  p_actor     uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_ruling card_rulings;
  v_oracle text;
BEGIN
  v_oracle := admin__card_oracle_key(p_card_id);
  IF v_oracle IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;

  DELETE FROM card_rulings
  WHERE id = p_ruling_id AND oracle_key = v_oracle
  RETURNING * INTO v_ruling;
  IF v_ruling.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ruling_not_found');
  END IF;

  PERFORM admin__log(
    p_actor, 'card.ruling.delete', 'card_ruling', p_ruling_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'oracle_key', v_ruling.oracle_key,
      'card_id',    v_ruling.card_id,
      'type',       v_ruling.type,
      'text',       v_ruling.text
    ))
  );

  RETURN jsonb_build_object('ok', true, 'ruling_id', p_ruling_id);
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Service role only, same as every other table in this schema. Formats and
-- legalities are public *data*, but they are read through the API's service-role
-- client, never straight from the browser.
REVOKE ALL ON TABLE
  formats,
  card_legalities,
  card_legality_overrides,
  card_rulings
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  formats,
  card_legalities,
  card_legality_overrides,
  card_rulings
TO service_role;

DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'card_oracle_key(text)',
    'admin__format_json(formats)',
    'admin__card_oracle_key(text)',
    'admin_create_format(text, text, integer, boolean, uuid)',
    'admin_patch_format(text, jsonb, uuid)',
    'admin_delete_format(text, uuid)',
    'admin_reorder_formats(jsonb, uuid)',
    'admin_set_card_legality(text, text, text, boolean, uuid)',
    'admin_create_card_ruling(text, boolean, text, text, date, text, uuid)',
    'admin_patch_card_ruling(text, uuid, jsonb, uuid)',
    'admin_delete_card_ruling(text, uuid, uuid)',
    'admin__apply_card_patch(text, jsonb)'
  ]
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END;
$$;
