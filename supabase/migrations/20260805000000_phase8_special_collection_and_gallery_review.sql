-- Phase 8: special-collection printings and official-gallery review.
--
-- 1. `is:special` — the search/ruling-rule flag for printings on a numbering
--    track separate from the main set (Vendetta's SP1-SP6 showcase champions).
--    `metadata.special_collection` is stamped by the ingest worker from the
--    `riftbound_id` collector prefix; nothing here backfills it, because the
--    next ingest rewrites every printing's metadata anyway.
--
-- 2. The review queue gains a second observing source. Riot's official card
--    gallery now watches us alongside TCGPlayer, so `tcgplayer_payload` becomes
--    `payload`, rows carry a `source`, and `missing_card` joins the kinds.
--
-- Redefines `card_search_ast_to_sql` from
-- 20260802000000_phase7_keywords_and_ruling_rules.sql. The whole function is
-- restated rather than patched: it is one CREATE OR REPLACE, and the search
-- grammar and the ruling rule language are the same evaluator, so they must
-- never disagree about which flags exist.

-- ── 1. `is:special` ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION card_search_ast_to_sql(p_ast jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_op       text;
  v_children jsonb;
  v_child    jsonb;
  v_field    text;
  v_value    text;
  v_pattern  text;
  v_clean    text;
  v_words    text[];
  v_parts    text[];
  v_word     text;
  v_i        int;
  v_cmp      text;
  v_num      numeric;
  v_expr     text;
  v_status   text;
BEGIN
  IF p_ast IS NULL OR jsonb_typeof(p_ast) <> 'object' THEN
    RETURN 'true';
  END IF;

  v_op := p_ast->>'op';

  IF v_op = 'and' THEN
    v_children := p_ast->'children';
    IF v_children IS NULL OR jsonb_array_length(v_children) = 0 THEN
      RETURN 'true';
    END IF;
    v_parts := ARRAY[]::text[];
    FOR v_i IN 0..(jsonb_array_length(v_children) - 1) LOOP
      v_parts := v_parts || ('(' || card_search_ast_to_sql(v_children->v_i) || ')');
    END LOOP;
    RETURN array_to_string(v_parts, ' AND ');
  END IF;

  IF v_op = 'or' THEN
    v_children := p_ast->'children';
    IF v_children IS NULL OR jsonb_array_length(v_children) = 0 THEN
      RETURN 'false';
    END IF;
    v_parts := ARRAY[]::text[];
    FOR v_i IN 0..(jsonb_array_length(v_children) - 1) LOOP
      v_parts := v_parts || ('(' || card_search_ast_to_sql(v_children->v_i) || ')');
    END LOOP;
    RETURN array_to_string(v_parts, ' OR ');
  END IF;

  IF v_op = 'not' THEN
    v_child := p_ast->'child';
    IF v_child IS NULL THEN
      RETURN 'true';
    END IF;
    RETURN 'NOT (' || card_search_ast_to_sql(v_child) || ')';
  END IF;

  IF v_op = 'text' THEN
    v_value := coalesce(p_ast->>'value', '');
    v_clean := trim(regexp_replace(lower(v_value), '[^a-z0-9 ]', ' ', 'g'));
    IF length(v_clean) = 0 THEN
      RETURN 'true';
    END IF;
    v_words := regexp_split_to_array(v_clean, '\s+');
    v_parts := ARRAY[]::text[];
    FOREACH v_word IN ARRAY v_words LOOP
      IF length(v_word) > 0 THEN
        v_parts := v_parts || (v_word || ':*');
      END IF;
    END LOOP;
    IF array_length(v_parts, 1) IS NULL THEN
      RETURN 'true';
    END IF;
    RETURN 'c.name_search @@ to_tsquery(''simple'', ' ||
           quote_literal(array_to_string(v_parts, ' & ')) || ')';
  END IF;

  IF v_op = 'exact_name' THEN
    v_value := coalesce(p_ast->>'value', '');
    RETURN 'c.name_normalized = ' || quote_literal(v_value);
  END IF;

  IF v_op = 'filter' THEN
    v_field := p_ast->>'field';
    v_value := coalesce(p_ast->>'value', '');
    v_pattern := '%' || escape_ilike_pattern(v_value) || '%';

    IF v_field = 'type' THEN
      -- Match the type line broadly: type, supertype, or any tag.
      RETURN
        '((c.classification->>''type'') ILIKE '   || quote_literal(v_pattern) ||
        ' OR (c.classification->>''supertype'') ILIKE ' || quote_literal(v_pattern) ||
        ' OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(' ||
              'coalesce(c.classification->''tags'', ''[]''::jsonb)) tag ' ||
              'WHERE tag ILIKE ' || quote_literal(v_pattern) || '))';

    ELSIF v_field = 'supertype' THEN
      RETURN '(c.classification->>''supertype'') ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'rarity' THEN
      RETURN '(c.classification->>''rarity'') ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'artist' THEN
      RETURN 'a.name ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'name' THEN
      RETURN 'c.name ILIKE ' || quote_literal(v_pattern);

    ELSIF v_field = 'tag' THEN
      RETURN 'EXISTS (SELECT 1 FROM jsonb_array_elements_text(' ||
             'coalesce(c.classification->''tags'', ''[]''::jsonb)) tag ' ||
             'WHERE tag ILIKE ' || quote_literal(v_pattern) || ')';

    ELSIF v_field = 'keyword' THEN
      -- Exact containment against the normalized array — the parser has already
      -- folded the value to its base key, so `kw:"Deflect 3"` arrives as
      -- `deflect` and hits the GIN index.
      RETURN 'c.keywords @> ARRAY[' || quote_literal(lower(btrim(v_value))) || ']::text[]';

    ELSIF v_field = 'domain' THEN
      -- Exact (case-insensitive) rather than substring: domains are a small
      -- closed vocabulary, and a card may carry several.
      RETURN 'EXISTS (SELECT 1 FROM jsonb_array_elements_text(' ||
             'coalesce(c.classification->''domains'', ''[]''::jsonb)) dom ' ||
             'WHERE lower(dom) = ' || quote_literal(lower(btrim(v_value))) || ')';

    ELSIF v_field = 'set' THEN
      RETURN 'EXISTS (SELECT 1 FROM sets st WHERE st.id = c.set_id ' ||
             'AND lower(st.set_code) = ' || quote_literal(lower(btrim(v_value))) || ')';

    ELSIF v_field = 'produces' THEN
      -- Tokens and other produced parts hang off all_parts.
      RETURN 'EXISTS (SELECT 1 FROM jsonb_array_elements(' ||
             'coalesce(c.all_parts, ''[]''::jsonb)) part ' ||
             'WHERE (part->>''name'') ILIKE ' || quote_literal(v_pattern) || ')';

    ELSE
      RAISE EXCEPTION 'Unsupported filter field: %', v_field;
    END IF;
  END IF;

  IF v_op = 'numeric' THEN
    v_field := p_ast->>'field';
    v_cmp   := p_ast->>'cmp';
    BEGIN
      v_num := (p_ast->>'value')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'Numeric filter needs a number, got: %', p_ast->>'value';
    END;

    IF v_field = 'domain_count' THEN
      v_expr := 'jsonb_array_length(coalesce(c.classification->''domains'', ''[]''::jsonb))';
    ELSIF v_field IN ('energy', 'might', 'power') THEN
      -- Guard the cast: a stat may be absent, null, or (defensively) non-numeric
      -- text. Anything uncastable yields NULL, so the comparison is unknown and
      -- the card drops out — the same semantics the TS evaluator uses.
      v_expr :=
        '(CASE WHEN (c.attributes->>' || quote_literal(v_field) ||
        ') ~ ''^-?[0-9]+(\.[0-9]+)?$'' THEN (c.attributes->>' ||
        quote_literal(v_field) || ')::numeric END)';
    ELSE
      RAISE EXCEPTION 'Unsupported numeric field: %', v_field;
    END IF;

    IF v_cmp NOT IN ('eq', 'ne', 'gt', 'gte', 'lt', 'lte') THEN
      RAISE EXCEPTION 'Unsupported comparator: %', coalesce(v_cmp, '<null>');
    END IF;

    RETURN '(' || v_expr || ' ' || CASE v_cmp
      WHEN 'eq'  THEN '='
      WHEN 'ne'  THEN '<>'
      WHEN 'gt'  THEN '>'
      WHEN 'gte' THEN '>='
      WHEN 'lt'  THEN '<'
      WHEN 'lte' THEN '<='
    END || ' ' || v_num::text || ')';
  END IF;

  IF v_op = 'legality' THEN
    v_value  := lower(coalesce(p_ast->>'format', ''));
    v_status := coalesce(p_ast->>'status', '');
    IF v_status NOT IN ('legal', 'not_legal', 'banned') THEN
      RAISE EXCEPTION 'Unsupported legality status: %', v_status;
    END IF;
    -- Precedence: printing override → oracle row → default legal. The EXISTS
    -- guard means an unknown format code matches nothing, rather than matching
    -- every card by falling through to the default.
    RETURN
      '(EXISTS (SELECT 1 FROM formats f0 WHERE f0.code = ' || quote_literal(v_value) || ') ' ||
      'AND coalesce(' ||
        '(SELECT o.status FROM card_legality_overrides o ' ||
         'JOIN formats f1 ON f1.id = o.format_id ' ||
         'WHERE o.card_id = c.id AND f1.code = ' || quote_literal(v_value) || '), ' ||
        '(SELECT l.status FROM card_legalities l ' ||
         'JOIN formats f2 ON f2.id = l.format_id ' ||
         'WHERE l.oracle_key = c.oracle_key AND f2.code = ' || quote_literal(v_value) || '), ' ||
        '''legal'') = ' || quote_literal(v_status) || ')';
  END IF;

  IF v_op = 'flag' THEN
    v_value := coalesce(p_ast->>'value', '');
    -- Compare the JSON text to 'true' rather than casting: a malformed value
    -- would make a ::boolean cast raise mid-query.
    IF    v_value = 'token'        THEN RETURN 'c.is_token';
    ELSIF v_value = 'manual'       THEN RETURN '(c.source = ''manual'')';
    ELSIF v_value = 'signature'    THEN RETURN '((c.metadata->>''signature'') = ''true'')';
    ELSIF v_value = 'alternate'    THEN RETURN '((c.metadata->>''alternate_art'') = ''true'')';
    ELSIF v_value = 'overnumbered' THEN RETURN '((c.metadata->>''overnumbered'') = ''true'')';
    ELSIF v_value = 'special'      THEN RETURN '((c.metadata->>''special_collection'') = ''true'')';
    ELSIF v_value = 'foil'         THEN
      RETURN 'EXISTS (SELECT 1 FROM jsonb_array_elements_text(' ||
             'coalesce(c.metadata->''finishes'', ''[]''::jsonb)) fin ' ||
             'WHERE lower(fin) = ''foil'')';
    ELSE
      RAISE EXCEPTION 'Unsupported is: value: %', v_value;
    END IF;
  END IF;

  RAISE EXCEPTION 'Unknown AST op: %', coalesce(v_op, '<null>');
END;
$$;


-- ── 2. Review queue: a second observing source ────────────────────────────────
--
-- The queue was built when TCGPlayer was the only thing observing us. Riot's
-- official card gallery now does too, so the queue gains:
--
--   • `source`   — which upstream raised the entry ('tcgplayer' | 'gallery').
--                  Existing rows are all TCGPlayer, hence the default.
--   • `payload`  — renamed from `tcgplayer_payload`, which is no longer true of
--                  every row. The shape still varies by `kind`; `source` says
--                  how to read it.
--   • `missing_card` — a new kind: the gallery lists a printing we hold no card
--                  for. RiftCodex stays authoritative for what exists, so this
--                  is filed for a human rather than created.
--
-- DEPLOY ORDER: the column rename is visible to readers immediately, so apply
-- this migration and deploy the API together. The table is admin-only and the
-- ingest worker tolerates a failed queue sync, so the window is not load-bearing.

ALTER TABLE reconciliation_queue
  RENAME COLUMN tcgplayer_payload TO payload;

ALTER TABLE reconciliation_queue
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'tcgplayer';

ALTER TABLE reconciliation_queue
  DROP CONSTRAINT IF EXISTS reconciliation_queue_source_check;
ALTER TABLE reconciliation_queue
  ADD CONSTRAINT reconciliation_queue_source_check
  CHECK (source IN ('tcgplayer', 'gallery'));

ALTER TABLE reconciliation_queue
  DROP CONSTRAINT IF EXISTS reconciliation_queue_kind_check;
ALTER TABLE reconciliation_queue
  ADD CONSTRAINT reconciliation_queue_kind_check
  CHECK (kind IN ('unmatched_product', 'field_diff', 'missing_card'));

-- The review page filters by source as well as status.
CREATE INDEX IF NOT EXISTS reconciliation_queue_source_idx
  ON reconciliation_queue (source);

-- Redefines the upsert from 20260801000000_phase6_reconciliation_queue.sql for
-- the renamed column, the new kind and the new `source`. Batching, the
-- pending-only refresh and the prune contract are all unchanged: a resolved row
-- is still never touched, which is what makes an admin decision durable.
CREATE OR REPLACE FUNCTION ingest_reconciliation_queue(
  p_entries      jsonb,
  p_fingerprints jsonb,
  p_prune        boolean
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entries      jsonb := coalesce(p_entries, '[]'::jsonb);
  v_fingerprints text[];
  v_upserted     integer := 0;
  v_pruned       integer := 0;
BEGIN
  IF jsonb_typeof(v_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'entries must be a JSON array';
  END IF;

  WITH incoming AS (
    SELECT DISTINCT ON (e->>'fingerprint')
      e->>'fingerprint'                          AS fingerprint,
      e->>'kind'                                 AS kind,
      coalesce(NULLIF(e->>'source', ''), 'tcgplayer') AS source,
      coalesce(e->'payload', '{}'::jsonb)        AS payload,
      NULLIF(e->>'proposed_card_id', '')         AS proposed_card_id
    FROM jsonb_array_elements(v_entries) e
    WHERE NULLIF(e->>'fingerprint', '') IS NOT NULL
      AND e->>'kind' IN ('unmatched_product', 'field_diff', 'missing_card')
      AND coalesce(NULLIF(e->>'source', ''), 'tcgplayer') IN ('tcgplayer', 'gallery')
    ORDER BY e->>'fingerprint'
  ),
  upserted AS (
    INSERT INTO reconciliation_queue AS q
      (kind, source, fingerprint, payload, proposed_card_id, last_seen_at)
    SELECT kind, source, fingerprint, payload, proposed_card_id, now() FROM incoming
    ON CONFLICT (fingerprint) DO UPDATE SET
      -- Only a still-open entry is refreshed; a resolved one keeps the payload
      -- the admin actually acted on.
      kind             = EXCLUDED.kind,
      source           = EXCLUDED.source,
      payload          = EXCLUDED.payload,
      proposed_card_id = EXCLUDED.proposed_card_id,
      last_seen_at     = now()
    WHERE q.status = 'pending'
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_upserted FROM upserted;

  IF coalesce(p_prune, false) THEN
    IF jsonb_typeof(coalesce(p_fingerprints, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'fingerprints must be a JSON array';
    END IF;

    SELECT coalesce(array_agg(DISTINCT f), ARRAY[]::text[])
    INTO v_fingerprints
    FROM jsonb_array_elements_text(coalesce(p_fingerprints, '[]'::jsonb)) f
    WHERE NULLIF(f, '') IS NOT NULL;

    WITH deleted AS (
      DELETE FROM reconciliation_queue
      WHERE status = 'pending'
        AND NOT (fingerprint = ANY (v_fingerprints))
      RETURNING 1
    )
    SELECT count(*)::integer INTO v_pruned FROM deleted;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'upserted', v_upserted,
    'pruned', v_pruned
  );
END;
$$;

-- Unchanged apart from the default note, which no longer claims every entry
-- came from TCGPlayer. A `missing_card` entry is confirmed against a card the
-- admin created by hand, or dismissed; neither needs new logic here.
CREATE OR REPLACE FUNCTION admin_resolve_reconciliation_entry(
  p_entry_id uuid,
  p_action   text,
  p_card_id  text,
  p_patch    jsonb,
  p_note     text,
  p_actor    uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_entry   reconciliation_queue;
  v_card_id text;
  v_patch   jsonb := coalesce(p_patch, '{}'::jsonb);
  v_result  jsonb;
BEGIN
  IF p_action NOT IN ('confirm', 'dismiss') THEN
    RAISE EXCEPTION 'invalid reconciliation action: %', p_action;
  END IF;
  IF jsonb_typeof(v_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;

  SELECT * INTO v_entry
  FROM reconciliation_queue
  WHERE id = p_entry_id
  FOR UPDATE;
  IF v_entry.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reconciliation_entry_not_found');
  END IF;
  IF v_entry.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'reconciliation_entry_resolved');
  END IF;

  IF p_action = 'confirm' THEN
    v_card_id := coalesce(NULLIF(btrim(p_card_id), ''), v_entry.proposed_card_id);
    IF v_card_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'card_required');
    END IF;

    IF v_patch <> '{}'::jsonb THEN
      v_result := admin__patch_card(
        v_card_id,
        v_patch,
        coalesce(NULLIF(btrim(p_note), ''), 'Confirmed from the ingest review queue'),
        p_actor,
        'reconciliation.confirm.patch'
      );
      -- admin__patch_card reports a missing card rather than raising, so the
      -- queue entry stays pending and the admin can pick a different card.
      IF NOT coalesce((v_result->>'ok')::boolean, false) THEN
        RETURN v_result;
      END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM cards WHERE id = v_card_id) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
    END IF;
  END IF;

  UPDATE reconciliation_queue SET
    status           = CASE WHEN p_action = 'confirm' THEN 'confirmed' ELSE 'dismissed' END,
    proposed_card_id = coalesce(v_card_id, proposed_card_id),
    note             = coalesce(NULLIF(btrim(p_note), ''), note),
    resolved_by      = p_actor,
    resolved_at      = now()
  WHERE id = p_entry_id;

  PERFORM admin__log(
    p_actor,
    'reconciliation.' || p_action,
    'reconciliation_entry',
    p_entry_id::text,
    jsonb_strip_nulls(jsonb_build_object(
      'kind',        v_entry.kind,
      'fingerprint', v_entry.fingerprint,
      'card_id',     v_card_id,
      'patch',       NULLIF(v_patch, '{}'::jsonb),
      'note',        NULLIF(btrim(p_note), '')
    ))
  );

  RETURN jsonb_build_object(
    'ok', true,
    'entry_id', p_entry_id,
    'status', CASE WHEN p_action = 'confirm' THEN 'confirmed' ELSE 'dismissed' END,
    'card_id', v_card_id
  );
END;
$$;

DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'ingest_reconciliation_queue(jsonb, jsonb, boolean)',
    'admin_resolve_reconciliation_entry(uuid, text, text, jsonb, text, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END;
$$;
