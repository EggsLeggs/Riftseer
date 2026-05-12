-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  search_card_ids — evaluate a Card Search AST safely in Postgres        │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Used by SupabaseCardProvider for any AST shape that cannot be expressed
-- with the legacy fast paths (anything other than `ExactNameOnly` or
-- `LegacyTextOnly`). The TS layer stays responsible for hydrating full card
-- rows, deduping variant printings, and slicing for pagination — this RPC
-- only returns the matching ids (capped) plus the unfiltered total count.
--
-- The AST shape mirrors `CardSearchAst` in packages/core/src/card-search-query.ts:
--   { op: "and"|"or", children: AST[] }
--   { op: "not", child: AST }
--   { op: "text", value: <FTS string> }
--   { op: "exact_name", value: <pre-normalized> }
--   { op: "filter", field: "type"|"rarity"|"artist", value: <pattern source> }
--
-- Field whitelisting and ILIKE escaping happen inside the helper, so AST
-- payloads sent over PostgREST cannot inject SQL.

-- Escape `\`, `%`, `_` so a value can be wrapped in `%...%` for ILIKE without
-- the user controlling the wildcard semantics.
CREATE OR REPLACE FUNCTION escape_ilike_pattern(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(replace(replace(coalesce(v, ''), '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- Recursive AST → SQL boolean expression. Returns 'true' for empty / unknown
-- branches so the calling query is well-formed; raises on whitelist violations.
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
    ELSIF v_field = 'rarity' THEN
      RETURN '(c.classification->>''rarity'') ILIKE ' || quote_literal(v_pattern);
    ELSIF v_field = 'artist' THEN
      RETURN 'a.name ILIKE ' || quote_literal(v_pattern);
    ELSE
      RAISE EXCEPTION 'Unsupported filter field: %', v_field;
    END IF;
  END IF;

  RAISE EXCEPTION 'Unknown AST op: %', coalesce(v_op, '<null>');
END;
$$;

-- Main entry point. Returns:
--   { "ids": uuid[], "total": bigint }
--
-- `p_max_ids` caps how many ids are hydrated by the caller. `total` reflects
-- the true count of matching rows (no cap), so the UI can present accurate
-- pagination even when the cap is hit.
CREATE OR REPLACE FUNCTION search_card_ids(
  p_ast       jsonb,
  p_set       text    DEFAULT NULL,
  p_collector text    DEFAULT NULL,
  p_max_ids   int     DEFAULT 500
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_set_id uuid;
  v_where  text;
  v_sql    text;
  v_result jsonb;
BEGIN
  p_max_ids := greatest(1, least(coalesce(p_max_ids, 500), 5000));

  IF p_set IS NOT NULL AND p_set <> '' THEN
    SELECT id INTO v_set_id FROM sets WHERE set_code = upper(p_set);
    IF v_set_id IS NULL THEN
      RETURN jsonb_build_object('ids', '[]'::jsonb, 'total', 0);
    END IF;
  END IF;

  v_where := card_search_ast_to_sql(p_ast);
  IF v_set_id IS NOT NULL THEN
    v_where := v_where || ' AND c.set_id = ' || quote_literal(v_set_id);
  END IF;
  IF p_collector IS NOT NULL AND p_collector <> '' THEN
    v_where := v_where || ' AND c.collector_number = ' || quote_literal(p_collector);
  END IF;

  v_sql :=
    'WITH matched AS (' ||
    '  SELECT c.id, c.name FROM cards c ' ||
    '  LEFT JOIN artists a ON a.id = c.artist_id ' ||
    '  WHERE ' || v_where ||
    ') ' ||
    'SELECT jsonb_build_object(' ||
    '  ''ids'', coalesce((SELECT jsonb_agg(id ORDER BY name) FROM (' ||
    '    SELECT id, name FROM matched LIMIT ' || p_max_ids::text ||
    '  ) sub), ''[]''::jsonb), ' ||
    '  ''total'', (SELECT count(*) FROM matched) ' ||
    ')';

  EXECUTE v_sql INTO v_result;
  RETURN v_result;
END;
$$;

-- Service-role-only access (consistent with the rest of the schema).
REVOKE ALL ON FUNCTION search_card_ids(jsonb, text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION card_search_ast_to_sql(jsonb)            FROM PUBLIC;
REVOKE ALL ON FUNCTION escape_ilike_pattern(text)               FROM PUBLIC;
