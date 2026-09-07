-- ── refresh_resolved_printings survives pg-safeupdate ─────────────────────────
--
-- Production runs Supabase's safeupdate guard, which rejects any DELETE
-- without a WHERE clause — even inside a function. The projection's
-- full-rebuild path did exactly that, so the first real ingest failed at the
-- final prune with "DELETE requires a WHERE clause". Local Postgres carries no
-- such guard, which is why every rehearsal passed.
--
-- Same function as the baseline, one line changed: `WHERE true` states the
-- intent (yes, everything) in the form the guard accepts.

CREATE OR REPLACE FUNCTION refresh_resolved_printings(p_printing_ids text[] DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  IF p_printing_ids IS NULL THEN
    DELETE FROM resolved_printings WHERE true;
  ELSE
    DELETE FROM resolved_printings WHERE printing_id = ANY (p_printing_ids);
  END IF;

  WITH produced AS (
    SELECT rel.from_oracle_id AS oracle_id,
           coalesce(array_agg(DISTINCT tok.name ORDER BY tok.name), '{}'::text[]) AS names
    FROM oracle_relationships rel
    JOIN oracles tok ON tok.id = rel.to_oracle_id AND tok.deleted_at IS NULL
    WHERE rel.kind = 'makes_token'
    GROUP BY rel.from_oracle_id
  ),
  resolved AS (
    SELECT
      p.id AS printing_id,
      o.id AS oracle_id,
      CASE WHEN 'name' = ANY (d.cleared_fields) THEN o.name
           ELSE coalesce(d.name_override, o.name) END AS name,
      CASE WHEN 'card_type' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.card_type_override, o.card_type) END AS card_type,
      CASE WHEN 'supertype' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.supertype_override, o.supertype) END AS supertype,
      CASE WHEN 'energy' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.energy_override, o.energy) END AS energy,
      CASE WHEN 'might' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.might_override, o.might) END AS might,
      CASE WHEN 'power' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.power_override, o.power) END AS power,
      CASE WHEN 'might_bonus' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.might_bonus_override, o.might_bonus) END AS might_bonus,
      CASE WHEN 'text_rich' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.text_rich_override, o.text_rich) END AS text_rich,
      CASE WHEN 'text_plain' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.text_plain_override, o.text_plain) END AS text_plain,
      CASE WHEN 'equipment_text' = ANY (d.cleared_fields) THEN NULL
           ELSE coalesce(d.equipment_text_override, o.equipment_text) END AS equipment_text,
      o.is_token,
      apply_array_delta(o.tags,       d.tags_added,       d.tags_removed)       AS tags,
      apply_array_delta(o.domains,    d.domains_added,    d.domains_removed)    AS domains,
      apply_array_delta(o.meta_flags, d.meta_flags_added, d.meta_flags_removed) AS meta_flags,
      d.keywords_added,
      d.keywords_removed,
      (d.printing_id IS NOT NULL) AS has_delta,
      p.set_id, p.collector_number, p.released_at, p.rarity, p.artist_id,
      p.public_slug, p.finishes, p.is_signature, p.is_alternate_art,
      p.is_overnumbered, p.is_special_collection, p.source,
      (p.image_hosted_at IS NOT NULL) AS has_hosted_image,
      s.set_code, s.set_name, s.published_on, s.is_promo,
      a.name AS artist_name,
      coalesce(pr.names, '{}'::text[]) AS produces
    FROM printings p
    JOIN oracles o          ON o.id = p.oracle_id AND o.deleted_at IS NULL
    JOIN sets s             ON s.id = p.set_id
    LEFT JOIN artists a     ON a.id = p.artist_id
    LEFT JOIN printing_deltas d ON d.printing_id = p.id
    LEFT JOIN produced pr   ON pr.oracle_id = o.id
    WHERE p.deleted_at IS NULL
      AND (p_printing_ids IS NULL OR p.id = ANY (p_printing_ids))
  )
  INSERT INTO resolved_printings (
    printing_id, oracle_id, name, name_normalized, name_search,
    card_type, supertype, is_token, energy, might, power, might_bonus,
    text_rich, text_plain, equipment_text,
    keywords, tags, domains, meta_flags, produces,
    set_id, set_code, set_name, published_on, collector_number, released_at,
    rarity, artist_id, artist_name, public_slug,
    finishes, is_signature, is_alternate_art, is_overnumbered,
    is_special_collection, is_promo_set, has_hosted_image,
    source, has_delta
  )
  SELECT
    r.printing_id,
    r.oracle_id,
    r.name,
    -- Mirrors normalizeCardName() in packages/types/src/parser.ts.
    regexp_replace(
      regexp_replace(
        replace(replace(lower(r.name), '''', ''), '-', ' '),
        '[^\w\s]', '', 'g'
      ),
      '\s+', ' ', 'g'
    ),
    to_tsvector('simple', coalesce(r.name, '')),
    r.card_type, r.supertype, r.is_token, r.energy, r.might, r.power,
    r.might_bonus, r.text_rich, r.text_plain, r.equipment_text,
    -- Keywords come from the *resolved* rules text, so a printing whose text
    -- is overridden gets the badges its own text carries, then its own
    -- add/remove delta on top.
    apply_array_delta(
      card_keywords_from_text(coalesce(r.text_rich, r.text_plain, '')),
      r.keywords_added,
      r.keywords_removed
    ),
    r.tags, r.domains, r.meta_flags, r.produces,
    r.set_id, r.set_code, r.set_name, r.published_on, r.collector_number,
    r.released_at, r.rarity, r.artist_id, r.artist_name, r.public_slug,
    r.finishes, r.is_signature, r.is_alternate_art, r.is_overnumbered,
    r.is_special_collection, r.is_promo, r.has_hosted_image,
    r.source, r.has_delta
  FROM resolved r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
