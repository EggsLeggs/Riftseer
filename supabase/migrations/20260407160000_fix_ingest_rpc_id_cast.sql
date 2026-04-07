-- Re-create ingest_card_data after cards.id changed from uuid to text.
-- Removes the ::uuid cast on card id.

CREATE OR REPLACE FUNCTION ingest_card_data(
  p_sets    jsonb,
  p_artists jsonb,
  p_cards   jsonb
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
        WHEN NULLIF(s->>'published_on', '') ~ '^\d{4}-\d{2}-\d{2}$'
          THEN (s->>'published_on')::date
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

  -- Build set_code → id map for FK resolution
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

  -- Build artist name → id map for FK resolution
  SELECT jsonb_object_agg(name, id::text)
  INTO v_artist_id_map
  FROM artists
  WHERE name IN (SELECT a2->>'name' FROM jsonb_array_elements(p_artists) a2);

  -- ── 3. Upsert cards ─────────────────────────────────────────────────────────
  FOR c IN SELECT * FROM jsonb_array_elements(p_cards)
  LOOP
    INSERT INTO cards (
      id, name, name_normalized, collector_number, released_at,
      set_id, artist_id,
      external_ids, attributes, classification, text, metadata, media,
      purchase_uris, prices,
      all_parts, used_by, related_champions, related_legends, related_printings,
      is_token, ingested_at
    )
    VALUES (
      c->>'id',
      c->>'name',
      c->>'name_normalized',
      c->>'collector_number',
      (c->>'released_at')::date,
      (v_set_id_map->>(c->>'set_code'))::uuid,
      (v_artist_id_map->>(c->>'artist'))::uuid,
      coalesce(c->'external_ids',      '{}'::jsonb),
      coalesce(c->'attributes',        '{}'::jsonb),
      coalesce(c->'classification',    '{}'::jsonb),
      coalesce(c->'text',              '{}'::jsonb),
      coalesce(c->'metadata',          '{}'::jsonb),
      coalesce(c->'media',             '{}'::jsonb),
      coalesce(c->'purchase_uris',     '{}'::jsonb),
      coalesce(c->'prices',            '{}'::jsonb),
      coalesce(c->'all_parts',         '[]'::jsonb),
      coalesce(c->'used_by',           '[]'::jsonb),
      coalesce(c->'related_champions', '[]'::jsonb),
      coalesce(c->'related_legends',   '[]'::jsonb),
      coalesce(c->'related_printings', '[]'::jsonb),
      coalesce((c->>'is_token')::boolean, false),
      now()
    )
    ON CONFLICT (id) DO UPDATE SET
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
      related_printings  = EXCLUDED.related_printings,
      is_token           = EXCLUDED.is_token,
      ingested_at        = EXCLUDED.ingested_at;
  END LOOP;

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
