-- ── Ruling targets carry a readable label ─────────────────────────────────────
--
-- Reader: the admin rulings page, which rendered a saved target as a bare
-- ObjectId or UUID. The picker showed names while choosing and then lost them
-- on save, so a ruling pointing at the wrong card — or at a soft-deleted one —
-- looked exactly like a healthy one.
--
-- Writer: nothing. This adds no column and stores nothing; `admin__ruling_json`
-- already had both ids in hand and simply did not resolve them.
--
-- `admin__ruling_json` is the one place a target is serialised — it backs
-- admin_list_rulings, admin_create_ruling and admin_patch_ruling — so replacing
-- it here is what keeps the three from needing their own copy of the join.
--
-- `deleted` matters because a soft-deleted oracle or printing keeps its
-- ruling_targets row (the cascade only fires on a hard delete) while quietly
-- dropping out of every read path. Without this the ruling just stops appearing
-- on card pages with nothing in the UI to explain why.

CREATE OR REPLACE FUNCTION admin__ruling_json(p_ruling_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'object', 'ruling', 'id', ru.id, 'type', ru.type, 'text', ru.text,
    'dated', ru.dated, 'source', ru.source, 'active', ru.active,
    'created_at', ru.created_at, 'updated_at', ru.updated_at,
    'targets', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', t.id, 'kind', t.kind, 'oracle_id', t.oracle_id,
        'printing_id', t.printing_id, 'query', t.query,
        'match_count', CASE WHEN t.kind = 'query'
          THEN (SELECT count(*) FROM ruling_matches m WHERE m.target_id = t.id)
          ELSE NULL END,
        -- A printing reads as "Name (SET 123)" so the two printings of one card
        -- are told apart; an oracle is the rules object and has only its name.
        'label', CASE t.kind
          WHEN 'oracle' THEN (SELECT o.name FROM oracles o WHERE o.id = t.oracle_id)
          WHEN 'printing' THEN (
            SELECT o.name || ' (' || s.set_code || ' ' ||
                   coalesce(p.collector_number, '?') || ')'
            FROM printings p
            JOIN oracles o ON o.id = p.oracle_id
            JOIN sets s ON s.id = p.set_id
            WHERE p.id = t.printing_id)
          ELSE NULL END,
        'deleted', CASE t.kind
          WHEN 'oracle' THEN EXISTS (
            SELECT 1 FROM oracles o
            WHERE o.id = t.oracle_id AND o.deleted_at IS NOT NULL)
          WHEN 'printing' THEN EXISTS (
            SELECT 1 FROM printings p
            WHERE p.id = t.printing_id AND p.deleted_at IS NOT NULL)
          ELSE false END)
        ORDER BY t.kind, t.created_at)
      FROM ruling_targets t WHERE t.ruling_id = ru.id), '[]'::jsonb))
  FROM rulings ru WHERE ru.id = p_ruling_id;
$$;

REVOKE ALL ON FUNCTION admin__ruling_json(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin__ruling_json(uuid) TO service_role;
