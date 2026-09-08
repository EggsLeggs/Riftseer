-- Deterministic ordering for the one search path.
--
-- `search_printing_ids` ordered by `name` alone. Names are not unique: with
-- `unique=prints` a set's alternate arts are separate rows sharing one name,
-- and Postgres does not promise a stable order between rows that tie. Two
-- things rode on that order — the `LIMIT p_max_ids` cut, and the id list the
-- provider slices a page out of — so a paging caller could see a printing
-- twice or never. The Tabletop Simulator deck loader pages a whole set, which
-- is what made a latent risk a real one.
--
-- `printing_id` is unique, so appending it to both ORDER BY clauses makes the
-- sort total. Nothing else in the function changes.

CREATE OR REPLACE FUNCTION search_printing_ids(
  p_ast       jsonb,
  p_set       text    DEFAULT NULL,
  p_collector text    DEFAULT NULL,
  p_max_ids   int     DEFAULT 500,
  p_collapse  boolean DEFAULT true
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
    SELECT id INTO v_set_id FROM sets WHERE set_code = upper(p_set) AND deleted_at IS NULL;
    IF v_set_id IS NULL THEN
      RETURN jsonb_build_object('ids', '[]'::jsonb, 'total', 0);
    END IF;
  END IF;

  v_where := card_search_ast_to_sql(p_ast);
  IF v_set_id IS NOT NULL THEN
    v_where := v_where || ' AND r.set_id = ' || quote_literal(v_set_id);
  END IF;
  IF p_collector IS NOT NULL AND p_collector <> '' THEN
    -- Case-insensitive: prefixed tracks print `T03`/`SP3`/`R01` and variants
    -- print `42a`, so a caller cannot be expected to match our casing exactly.
    v_where := v_where || ' AND lower(r.collector_number) = ' ||
               quote_literal(lower(p_collector));
  END IF;

  IF p_collapse THEN
    v_sql :=
      'WITH matched AS (' ||
      '  SELECT r.printing_id, r.oracle_id, r.name, ' ||
      '         row_number() OVER (PARTITION BY r.oracle_id ORDER BY ' ||
      '           (o.preferred_printing_id IS DISTINCT FROM r.printing_id), ' ||
      '           r.printing_id) AS rn ' ||
      '  FROM resolved_printings r ' ||
      '  JOIN oracles o ON o.id = r.oracle_id ' ||
      '  WHERE ' || v_where ||
      '), picked AS (SELECT printing_id, name FROM matched WHERE rn = 1)';
  ELSE
    v_sql :=
      'WITH picked AS (' ||
      '  SELECT r.printing_id, r.name FROM resolved_printings r WHERE ' || v_where || ')';
  END IF;

  v_sql := v_sql ||
    ' SELECT jsonb_build_object(' ||
    '   ''ids'', coalesce((SELECT jsonb_agg(printing_id ORDER BY name, printing_id) FROM (' ||
    '     SELECT printing_id, name FROM picked ORDER BY name, printing_id LIMIT ' || p_max_ids::text ||
    '   ) sub), ''[]''::jsonb), ' ||
    '   ''total'', (SELECT count(*) FROM picked))';

  EXECUTE v_sql INTO v_result;
  RETURN v_result;
END;
$$;
