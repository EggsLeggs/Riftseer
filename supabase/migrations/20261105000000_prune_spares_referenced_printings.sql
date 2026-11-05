-- ── the prune spares a printing a deck still points at ───────────────────────
--
-- `deck_cards` references printings ON DELETE RESTRICT and
-- `deck_token_printings` ON DELETE CASCADE, so the prune had two ways to go
-- wrong on a printing that left the valid-id list while a saved deck still
-- used it: the first raises and fails the whole ingest run, the second quietly
-- deletes the player's chosen token art. Reproduced against a local database,
-- both on a real catalogue.
--
-- This was always reachable — any id RiftCodex retired could trigger it — but
-- stayed theoretical while nothing else removed ids in bulk. Carrying a set
-- the upstream source has not published yet makes it near-certain: the day
-- that set arrives upstream, hundreds of ids leave the list in one run.
--
-- A referenced row is now skipped rather than deleted, so it goes stale rather
-- than taking the pipeline with it, and `spared_printings` in the result says
-- how many. Admin edits and locked columns on such a row are untouched, since
-- the row itself is untouched.
--
-- Replaces `ingest_catalogue` from the squashed baseline; nothing else changes.

CREATE OR REPLACE FUNCTION ingest_catalogue(
  p_sets               jsonb   DEFAULT NULL,
  p_artists            jsonb   DEFAULT NULL,
  p_oracles            jsonb   DEFAULT NULL,
  p_printings          jsonb   DEFAULT NULL,
  p_deltas             jsonb   DEFAULT NULL,
  p_relationships      jsonb   DEFAULT NULL,
  p_valid_printing_ids jsonb   DEFAULT NULL,
  p_prune              boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_touched  text[] := '{}';
  v_valid    text[];
  v_pruned_p integer := 0;
  v_pruned_o integer := 0;
  v_spared_p integer := 0;
BEGIN
  -- One projection rebuild at the end beats thousands of per-row ones.
  PERFORM set_config('riftseer.defer_projection', 'on', true);

  -- ── sets ────────────────────────────────────────────────────────────────
  IF p_sets IS NOT NULL THEN
    INSERT INTO sets (
      set_code, set_name, set_uri, set_search_uri, published_on, is_promo,
      parent_set_code, riftcodex_set_id, tcgplayer_group_id, cardmarket_id
    )
    SELECT upper(s.set_code), s.set_name, s.set_uri, s.set_search_uri,
           s.published_on, coalesce(s.is_promo, false), s.parent_set_code,
           s.riftcodex_set_id, s.tcgplayer_group_id, s.cardmarket_id
    FROM jsonb_to_recordset(p_sets) AS s(
      set_code text, set_name text, set_uri text, set_search_uri text,
      published_on date, is_promo boolean, parent_set_code text,
      riftcodex_set_id text, tcgplayer_group_id text, cardmarket_id text
    )
    WHERE s.set_code IS NOT NULL AND s.set_name IS NOT NULL
    ON CONFLICT (set_code) DO UPDATE SET
      set_name        = CASE WHEN 'set_name' = ANY (sets.locked_fields)
                             THEN sets.set_name ELSE excluded.set_name END,
      set_uri         = coalesce(excluded.set_uri, sets.set_uri),
      set_search_uri  = coalesce(excluded.set_search_uri, sets.set_search_uri),
      published_on    = CASE WHEN 'published_on' = ANY (sets.locked_fields)
                             THEN sets.published_on ELSE excluded.published_on END,
      is_promo        = CASE WHEN 'is_promo' = ANY (sets.locked_fields)
                             THEN sets.is_promo ELSE excluded.is_promo END,
      parent_set_code = coalesce(excluded.parent_set_code, sets.parent_set_code),
      riftcodex_set_id   = coalesce(excluded.riftcodex_set_id, sets.riftcodex_set_id),
      tcgplayer_group_id = coalesce(excluded.tcgplayer_group_id, sets.tcgplayer_group_id),
      cardmarket_id      = coalesce(excluded.cardmarket_id, sets.cardmarket_id)
    WHERE sets.deleted_at IS NULL;
  END IF;

  -- ── artists ─────────────────────────────────────────────────────────────
  IF p_artists IS NOT NULL THEN
    INSERT INTO artists (name)
    SELECT DISTINCT btrim(a.name)
    FROM jsonb_array_elements_text(p_artists) AS a(name)
    WHERE btrim(coalesce(a.name, '')) <> ''
    ON CONFLICT (name) DO NOTHING;
  END IF;

  -- ── oracles ─────────────────────────────────────────────────────────────
  IF p_oracles IS NOT NULL THEN
    INSERT INTO oracles (
      oracle_key, slug, name, name_normalized, card_type, supertype, is_token,
      energy, might, power, might_bonus, equipment_text, text_rich, text_plain,
      tags, domains, meta_flags, ingested_at
    )
    SELECT o.oracle_key, o.slug, o.name, o.name_normalized, o.card_type,
           o.supertype, coalesce(o.is_token, false), o.energy, o.might,
           o.power, o.might_bonus, o.equipment_text, o.text_rich, o.text_plain,
           coalesce(o.tags, '{}'), coalesce(o.domains, '{}'),
           coalesce(o.meta_flags, '{}'), now()
    FROM jsonb_to_recordset(p_oracles) AS o(
      oracle_key text, slug text, name text, name_normalized text,
      card_type text, supertype text, is_token boolean, energy integer,
      might integer, power integer, might_bonus integer, equipment_text text,
      text_rich text, text_plain text, tags text[], domains text[],
      meta_flags text[]
    )
    WHERE o.oracle_key IS NOT NULL AND o.name IS NOT NULL AND o.slug IS NOT NULL
    ON CONFLICT (oracle_key) DO UPDATE SET
      -- The slug is pinned on first insert, exactly like a printing's.
      slug            = oracles.slug,
      name            = CASE WHEN 'name' = ANY (oracles.locked_fields)
                             THEN oracles.name ELSE excluded.name END,
      name_normalized = CASE WHEN 'name' = ANY (oracles.locked_fields)
                             THEN oracles.name_normalized ELSE excluded.name_normalized END,
      card_type       = CASE WHEN 'card_type' = ANY (oracles.locked_fields)
                             THEN oracles.card_type ELSE excluded.card_type END,
      supertype       = CASE WHEN 'supertype' = ANY (oracles.locked_fields)
                             THEN oracles.supertype ELSE excluded.supertype END,
      is_token        = CASE WHEN 'is_token' = ANY (oracles.locked_fields)
                             THEN oracles.is_token ELSE excluded.is_token END,
      energy          = CASE WHEN 'energy' = ANY (oracles.locked_fields)
                             THEN oracles.energy ELSE excluded.energy END,
      might           = CASE WHEN 'might' = ANY (oracles.locked_fields)
                             THEN oracles.might ELSE excluded.might END,
      power           = CASE WHEN 'power' = ANY (oracles.locked_fields)
                             THEN oracles.power ELSE excluded.power END,
      -- might_bonus and equipment_text come from the official gallery, which
      -- clears them by sending NULL when a card stops being equipment. They
      -- are assigned rather than coalesced so that clearing works.
      might_bonus     = CASE WHEN 'might_bonus' = ANY (oracles.locked_fields)
                             THEN oracles.might_bonus ELSE excluded.might_bonus END,
      equipment_text  = CASE WHEN 'equipment_text' = ANY (oracles.locked_fields)
                             THEN oracles.equipment_text ELSE excluded.equipment_text END,
      text_rich       = CASE WHEN 'text_rich' = ANY (oracles.locked_fields)
                             THEN oracles.text_rich ELSE excluded.text_rich END,
      text_plain      = CASE WHEN 'text_plain' = ANY (oracles.locked_fields)
                             THEN oracles.text_plain ELSE excluded.text_plain END,
      tags            = CASE WHEN 'tags' = ANY (oracles.locked_fields)
                             THEN oracles.tags ELSE excluded.tags END,
      domains         = CASE WHEN 'domains' = ANY (oracles.locked_fields)
                             THEN oracles.domains ELSE excluded.domains END,
      meta_flags      = CASE WHEN 'meta_flags' = ANY (oracles.locked_fields)
                             THEN oracles.meta_flags ELSE excluded.meta_flags END,
      ingested_at     = now()
    WHERE oracles.deleted_at IS NULL;
  END IF;

  -- ── printings ───────────────────────────────────────────────────────────
  IF p_printings IS NOT NULL THEN
    INSERT INTO printings (
      id, oracle_id, set_id, artist_id, collector_number, released_at, rarity,
      public_slug, flavour_text, finishes, is_signature, is_alternate_art,
      is_overnumbered, is_special_collection, riftcodex_id, riftbound_id,
      tcgplayer_id, cardmarket_id, image_source_url, image_source_hash,
      image_source_provider, image_orientation, image_alt_text,
      price_normal, price_foil, price_low_normal, price_low_foil,
      tcgplayer_url, cardmarket_url, ingested_at
    )
    SELECT
      pr.id, o.id, s.id, a.id, pr.collector_number, pr.released_at, pr.rarity,
      pr.public_slug, pr.flavour_text, coalesce(pr.finishes, '{}'),
      coalesce(pr.is_signature, false), coalesce(pr.is_alternate_art, false),
      coalesce(pr.is_overnumbered, false), coalesce(pr.is_special_collection, false),
      pr.riftcodex_id, pr.riftbound_id, pr.tcgplayer_id, pr.cardmarket_id,
      pr.image_source_url, pr.image_source_hash, pr.image_source_provider,
      pr.image_orientation, pr.image_alt_text,
      pr.price_normal, pr.price_foil, pr.price_low_normal, pr.price_low_foil,
      pr.tcgplayer_url, pr.cardmarket_url, now()
    FROM jsonb_to_recordset(p_printings) AS pr(
      id text, oracle_key text, set_code text, artist text,
      collector_number text, released_at date, rarity text, public_slug text,
      flavour_text text, finishes text[], is_signature boolean,
      is_alternate_art boolean, is_overnumbered boolean,
      is_special_collection boolean, riftcodex_id text, riftbound_id text,
      tcgplayer_id text, cardmarket_id text, image_source_url text,
      image_source_hash text, image_source_provider text,
      image_orientation text, image_alt_text text, price_normal numeric,
      price_foil numeric, price_low_normal numeric, price_low_foil numeric,
      tcgplayer_url text, cardmarket_url text
    )
    JOIN oracles o ON o.oracle_key = pr.oracle_key AND o.deleted_at IS NULL
    JOIN sets s    ON s.set_code = upper(pr.set_code) AND s.deleted_at IS NULL
    LEFT JOIN artists a ON a.name = btrim(pr.artist)
    WHERE pr.id IS NOT NULL AND pr.public_slug IS NOT NULL
    ON CONFLICT (id) DO UPDATE SET
      oracle_id   = excluded.oracle_id,
      -- Pinned on first insert: public URLs must not drift as upstream data
      -- is corrected.
      public_slug = printings.public_slug,
      set_id      = CASE WHEN 'set_id' = ANY (printings.locked_fields)
                         THEN printings.set_id ELSE excluded.set_id END,
      artist_id   = CASE WHEN 'artist_id' = ANY (printings.locked_fields)
                         THEN printings.artist_id
                         ELSE coalesce(excluded.artist_id, printings.artist_id) END,
      collector_number = CASE WHEN 'collector_number' = ANY (printings.locked_fields)
                              THEN printings.collector_number
                              ELSE excluded.collector_number END,
      released_at = CASE WHEN 'released_at' = ANY (printings.locked_fields)
                         THEN printings.released_at ELSE excluded.released_at END,
      rarity      = CASE WHEN 'rarity' = ANY (printings.locked_fields)
                         THEN printings.rarity ELSE excluded.rarity END,
      flavour_text = CASE WHEN 'flavour_text' = ANY (printings.locked_fields)
                          THEN printings.flavour_text ELSE excluded.flavour_text END,
      finishes    = CASE WHEN 'finishes' = ANY (printings.locked_fields)
                         THEN printings.finishes ELSE excluded.finishes END,
      is_signature = CASE WHEN 'is_signature' = ANY (printings.locked_fields)
                          THEN printings.is_signature ELSE excluded.is_signature END,
      is_alternate_art = CASE WHEN 'is_alternate_art' = ANY (printings.locked_fields)
                              THEN printings.is_alternate_art
                              ELSE excluded.is_alternate_art END,
      is_overnumbered = CASE WHEN 'is_overnumbered' = ANY (printings.locked_fields)
                             THEN printings.is_overnumbered
                             ELSE excluded.is_overnumbered END,
      is_special_collection = CASE WHEN 'is_special_collection' = ANY (printings.locked_fields)
                                   THEN printings.is_special_collection
                                   ELSE excluded.is_special_collection END,
      riftcodex_id = coalesce(excluded.riftcodex_id, printings.riftcodex_id),
      riftbound_id = coalesce(excluded.riftbound_id, printings.riftbound_id),
      tcgplayer_id = CASE WHEN 'tcgplayer_id' = ANY (printings.locked_fields)
                          THEN printings.tcgplayer_id
                          ELSE coalesce(excluded.tcgplayer_id, printings.tcgplayer_id) END,
      cardmarket_id = coalesce(excluded.cardmarket_id, printings.cardmarket_id),
      -- Image state is owned by the queue, not by ingest: only the source URL
      -- and its hash are refreshed here, and apply_printing_hosted_media
      -- publishes the variants once R2 has them.
      image_source_url  = CASE WHEN 'image' = ANY (printings.locked_fields)
                               THEN printings.image_source_url
                               ELSE coalesce(excluded.image_source_url,
                                             printings.image_source_url) END,
      image_source_hash = CASE WHEN 'image' = ANY (printings.locked_fields)
                               THEN printings.image_source_hash
                               ELSE coalesce(excluded.image_source_hash,
                                             printings.image_source_hash) END,
      image_source_provider = CASE WHEN 'image' = ANY (printings.locked_fields)
                                   THEN printings.image_source_provider
                                   ELSE coalesce(excluded.image_source_provider,
                                                 printings.image_source_provider) END,
      image_orientation = coalesce(excluded.image_orientation, printings.image_orientation),
      image_alt_text    = coalesce(excluded.image_alt_text, printings.image_alt_text),
      -- Prices are volatile and never locked.
      price_normal     = coalesce(excluded.price_normal, printings.price_normal),
      price_foil       = coalesce(excluded.price_foil, printings.price_foil),
      price_low_normal = coalesce(excluded.price_low_normal, printings.price_low_normal),
      price_low_foil   = coalesce(excluded.price_low_foil, printings.price_low_foil),
      tcgplayer_url    = coalesce(excluded.tcgplayer_url, printings.tcgplayer_url),
      cardmarket_url   = coalesce(excluded.cardmarket_url, printings.cardmarket_url),
      ingested_at      = now()
    WHERE printings.deleted_at IS NULL;

    SELECT coalesce(array_agg(value), '{}'::text[]) INTO v_touched
    FROM jsonb_array_elements_text(
      coalesce(jsonb_path_query_array(p_printings, '$[*].id'), '[]'::jsonb));
  END IF;

  -- Printings of an oracle touched by this batch may live in another batch,
  -- so they need re-resolving too.
  IF p_oracles IS NOT NULL THEN
    SELECT coalesce(array_agg(DISTINCT p.id), '{}'::text[]) INTO v_touched
    FROM printings p
    WHERE p.id = ANY (v_touched)
       OR p.oracle_id IN (
         SELECT o.id FROM oracles o
         WHERE o.oracle_key IN (
           SELECT value FROM jsonb_array_elements_text(
             coalesce(jsonb_path_query_array(p_oracles, '$[*].oracle_key'), '[]'::jsonb))));
  END IF;

  -- ── ingest-owned deltas ─────────────────────────────────────────────────
  -- Admin deltas are never touched: source is the whole boundary.
  IF p_deltas IS NOT NULL THEN
    DELETE FROM printing_deltas d
    WHERE d.source = 'ingest' AND d.printing_id = ANY (v_touched);

    INSERT INTO printing_deltas (
      printing_id, tags_added, tags_removed, domains_added, domains_removed,
      keywords_added, keywords_removed, meta_flags_added, meta_flags_removed,
      name_override, card_type_override, supertype_override, energy_override,
      might_override, power_override, might_bonus_override, text_rich_override,
      text_plain_override, equipment_text_override, cleared_fields, source
    )
    SELECT d.printing_id,
           coalesce(d.tags_added, '{}'), coalesce(d.tags_removed, '{}'),
           coalesce(d.domains_added, '{}'), coalesce(d.domains_removed, '{}'),
           coalesce(d.keywords_added, '{}'), coalesce(d.keywords_removed, '{}'),
           coalesce(d.meta_flags_added, '{}'), coalesce(d.meta_flags_removed, '{}'),
           d.name_override, d.card_type_override, d.supertype_override,
           d.energy_override, d.might_override, d.power_override,
           d.might_bonus_override, d.text_rich_override, d.text_plain_override,
           d.equipment_text_override, coalesce(d.cleared_fields, '{}'), 'ingest'
    FROM jsonb_to_recordset(p_deltas) AS d(
      printing_id text, tags_added text[], tags_removed text[],
      domains_added text[], domains_removed text[], keywords_added text[],
      keywords_removed text[], meta_flags_added text[], meta_flags_removed text[],
      name_override text, card_type_override text, supertype_override text,
      energy_override integer, might_override integer, power_override integer,
      might_bonus_override integer, text_rich_override text,
      text_plain_override text, equipment_text_override text,
      cleared_fields text[]
    )
    JOIN printings p ON p.id = d.printing_id AND p.deleted_at IS NULL
    ON CONFLICT (printing_id) DO NOTHING;
  END IF;

  -- ── ingest-owned relationships ──────────────────────────────────────────
  -- An oracle whose relationships an admin has claimed is skipped entirely,
  -- both when clearing and when inserting — the same locked_fields rule every
  -- other value follows.
  IF p_relationships IS NOT NULL THEN
    DELETE FROM oracle_relationships rel
    WHERE rel.source = 'ingest'
      AND NOT EXISTS (
        SELECT 1 FROM oracles o
        WHERE o.id = rel.from_oracle_id AND 'relationships' = ANY (o.locked_fields));

    INSERT INTO oracle_relationships (from_oracle_id, to_oracle_id, kind, source)
    SELECT fo.id, tt.id, rel.kind, 'ingest'
    FROM jsonb_to_recordset(p_relationships) AS rel(
      from_oracle_key text, to_oracle_key text, kind text
    )
    JOIN oracles fo ON fo.oracle_key = rel.from_oracle_key AND fo.deleted_at IS NULL
    JOIN oracles tt ON tt.oracle_key = rel.to_oracle_key   AND tt.deleted_at IS NULL
    WHERE fo.id <> tt.id
      AND rel.kind IN ('makes_token', 'character', 'signature')
      AND NOT ('relationships' = ANY (fo.locked_fields))
    ON CONFLICT (from_oracle_id, kind, to_oracle_id) DO NOTHING;
  END IF;

  -- ── prune ───────────────────────────────────────────────────────────────
  -- Runs only after every batch succeeded, against the complete valid-id
  -- list. Manual rows are never pruned; deleted rows are already gone.
  IF p_prune AND p_valid_printing_ids IS NOT NULL THEN
    SELECT coalesce(array_agg(value), '{}'::text[]) INTO v_valid
    FROM jsonb_array_elements_text(p_valid_printing_ids);

    IF array_length(v_valid, 1) > 0 THEN
      -- A printing a saved deck points at is never deleted, however thoroughly
      -- it has left upstream. `deck_cards` is ON DELETE RESTRICT, so deleting
      -- one raises and takes the whole ingest down with it; `deck_token_printings`
      -- is ON DELETE CASCADE, so deleting one silently throws away a player's
      -- chosen token art. Both were reachable: any id retired upstream could do
      -- it, and a set arriving upstream after we carried it drops hundreds at
      -- once. Such a row is left exactly as it is — visible, and with any admin
      -- edits and locked columns intact — and counted separately so a growing
      -- number is visible rather than silent.
      SELECT count(*) INTO v_spared_p
      FROM printings p
      WHERE p.source = 'riftcodex'
        AND NOT (p.id = ANY (v_valid))
        AND (EXISTS (SELECT 1 FROM deck_cards dc WHERE dc.printing_id = p.id)
          OR EXISTS (SELECT 1 FROM deck_token_printings dt WHERE dt.printing_id = p.id));

      DELETE FROM printings p
      WHERE p.source = 'riftcodex'
        AND NOT (p.id = ANY (v_valid))
        AND NOT EXISTS (SELECT 1 FROM deck_cards dc WHERE dc.printing_id = p.id)
        AND NOT EXISTS (SELECT 1 FROM deck_token_printings dt WHERE dt.printing_id = p.id);
      GET DIAGNOSTICS v_pruned_p = ROW_COUNT;

      DELETE FROM oracles o
      WHERE o.source = 'riftcodex'
        AND NOT EXISTS (SELECT 1 FROM printings p WHERE p.oracle_id = o.id);
      GET DIAGNOSTICS v_pruned_o = ROW_COUNT;
    END IF;
  END IF;

  -- ── set counts ──────────────────────────────────────────────────────────
  UPDATE sets s
  SET card_count = counts.n
  FROM (
    SELECT set_id, count(*) AS n FROM printings WHERE deleted_at IS NULL GROUP BY set_id
  ) counts
  WHERE counts.set_id = s.id AND s.card_count IS DISTINCT FROM counts.n;

  -- ── projection ──────────────────────────────────────────────────────────
  PERFORM set_config('riftseer.defer_projection', 'off', true);

  IF p_prune THEN
    PERFORM refresh_resolved_printings(NULL);
    PERFORM refresh_preferred_printings(NULL);
  ELSIF array_length(v_touched, 1) > 0 THEN
    PERFORM refresh_resolved_printings(v_touched);
    PERFORM refresh_preferred_printings(
      ARRAY(SELECT DISTINCT oracle_id FROM printings WHERE id = ANY (v_touched)));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'touched', coalesce(array_length(v_touched, 1), 0),
    'pruned_printings', v_pruned_p,
    'pruned_oracles', v_pruned_o,
    'spared_printings', v_spared_p
  );
END;
$$;

