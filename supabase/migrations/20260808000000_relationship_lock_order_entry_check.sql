-- ── Relationship lock order, continued ────────────────────────────────────────
-- 20260807000000_relationship_lock_order_and_queue_rename_guard.sql put the
-- oracle-group lock in id order but left the entry check above it as
-- `SELECT ... FOR UPDATE` on the path card. That takes one row of the group out
-- of turn, which is precisely the interleaving the ordered lock exists to
-- prevent: two concurrent saves on the same oracle group can still take each
-- other's rows in opposite orders and deadlock.
--
-- The check becomes existence-only, and the printing branch — which locks one
-- row and therefore cannot deadlock on ordering — takes the lock itself.
-- `card_not_found` is still returned in both branches.
--
-- Supersedes the `admin_set_card_relationships` body in 20260807000000; nothing
-- else about the function changes.

CREATE OR REPLACE FUNCTION admin_set_card_relationships(
  p_card_id       text,
  p_entries       jsonb,
  p_all_printings boolean,
  p_actor         uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kinds      text[] := ARRAY[
    'all_parts', 'used_by', 'related_champions',
    'related_legends', 'related_signatures', 'related_printings'
  ];
  v_entry      jsonb;
  v_stub       jsonb;
  v_snapshots  jsonb := '[]'::jsonb;
  v_oracle     text;
  v_all        boolean := coalesce(p_all_printings, true);
  v_scope      text;
  v_card_ids   text[];
  v_target_id  text;
  v_old        jsonb;
  v_patch      jsonb;
  v_prior_add  boolean;
BEGIN
  IF jsonb_typeof(coalesce(p_entries, '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'entries must be a JSON array';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
    GROUP BY e->>'kind', e->>'related_card_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'relationship entries must be unique by kind and related_card_id';
  END IF;

  -- Existence only. Locking the path card here takes it out of turn: the oracle
  -- branch below locks the whole group — this card included — in id order, and
  -- grabbing one row first is exactly the interleaving that deadlocks.
  PERFORM 1 FROM cards WHERE id = p_card_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;
  v_oracle := admin__card_oracle_key(p_card_id);

  FOR v_entry IN SELECT * FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb))
  LOOP
    IF NOT (v_entry->>'kind' = ANY (v_kinds)) THEN
      RAISE EXCEPTION 'invalid relationship kind: %', v_entry->>'kind';
    END IF;
    IF v_entry->>'action' NOT IN ('add', 'remove') THEN
      RAISE EXCEPTION 'invalid relationship action: %', v_entry->>'action';
    END IF;
    IF NULLIF(v_entry->>'related_card_id', '') IS NULL THEN
      RAISE EXCEPTION 'related_card_id must not be empty';
    END IF;
    IF v_entry->>'related_card_id' = p_card_id THEN
      RAISE EXCEPTION 'a card cannot be related to itself';
    END IF;
    IF v_entry->>'action' = 'add'
       AND NOT EXISTS (SELECT 1 FROM cards WHERE id = v_entry->>'related_card_id') THEN
      RAISE EXCEPTION 'unknown related_card_id: %', v_entry->>'related_card_id';
    END IF;
  END LOOP;

  IF v_all THEN
    v_scope := 'oracle';
    SELECT coalesce(array_agg(c.id ORDER BY c.id), ARRAY[p_card_id])
    INTO v_card_ids
    FROM cards c
    WHERE coalesce(c.oracle_key, card_oracle_key(c.name)) = v_oracle;

    -- Serialize siblings before snapshotting their live arrays. Locking in id
    -- order means two concurrent saves in the same oracle group queue behind
    -- each other rather than deadlock on rows locked in opposite orders.
    PERFORM 1 FROM cards c WHERE c.id = ANY (v_card_ids) ORDER BY c.id FOR UPDATE;
  ELSE
    v_scope := 'printing';
    v_card_ids := ARRAY[p_card_id];

    -- One row, so ordering is moot, but the lock the existence check above no
    -- longer takes still has to be held before the live arrays are read.
    PERFORM 1 FROM cards WHERE id = p_card_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
    END IF;
  END IF;

  -- Capture baseline stubs for new removes. Prefer a surviving remove's stub
  -- from the scope being replaced; else snapshot the path card's live array
  -- unless a prior add in that scope invented the link.
  FOR v_entry IN
    SELECT *
    FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
    WHERE e->>'action' = 'remove'
  LOOP
    v_stub := NULL;
    v_prior_add := false;

    IF v_all THEN
      SELECT o.baseline_stub
      INTO v_stub
      FROM card_relationship_overrides o
      WHERE o.oracle_key = v_oracle
        AND o.kind = v_entry->>'kind'
        AND o.related_card_id = v_entry->>'related_card_id'
        AND o.action = 'remove';

      SELECT EXISTS (
        SELECT 1
        FROM card_relationship_overrides o
        WHERE o.oracle_key = v_oracle
          AND o.kind = v_entry->>'kind'
          AND o.related_card_id = v_entry->>'related_card_id'
          AND o.action = 'add'
      ) INTO v_prior_add;
    ELSE
      SELECT o.baseline_stub
      INTO v_stub
      FROM card_relationship_overrides o
      WHERE o.card_id = p_card_id
        AND o.kind = v_entry->>'kind'
        AND o.related_card_id = v_entry->>'related_card_id'
        AND o.action = 'remove';

      SELECT EXISTS (
        SELECT 1
        FROM card_relationship_overrides o
        WHERE o.card_id = p_card_id
          AND o.kind = v_entry->>'kind'
          AND o.related_card_id = v_entry->>'related_card_id'
          AND o.action = 'add'
      ) INTO v_prior_add;
    END IF;

    IF v_stub IS NULL AND NOT v_prior_add THEN
      EXECUTE format(
        'SELECT element FROM jsonb_array_elements('
          || 'coalesce((SELECT %I FROM cards WHERE id = $1), ''[]''::jsonb)'
          || ') element WHERE element->>''id'' = $2 LIMIT 1',
        v_entry->>'kind'
      )
      INTO v_stub
      USING p_card_id, v_entry->>'related_card_id';
    END IF;

    IF jsonb_typeof(v_stub) = 'object' THEN
      v_snapshots := v_snapshots || jsonb_build_array(jsonb_build_object(
        'kind', v_entry->>'kind',
        'related_card_id', v_entry->>'related_card_id',
        'stub', v_stub
      ));
    END IF;
  END LOOP;

  FOREACH v_target_id IN ARRAY v_card_ids
  LOOP
    IF v_all THEN
      -- Undo prior oracle rows for the group plus this printing's exceptions
      -- (those exceptions are cleared when applying to all printings).
      SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'kind', o.kind,
        'related_card_id', o.related_card_id,
        'action', o.action,
        'baseline_stub', o.baseline_stub
      ))), '[]'::jsonb)
      INTO v_old
      FROM card_relationship_overrides o
      WHERE o.oracle_key = v_oracle
         OR o.card_id = v_target_id;
    ELSE
      SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'kind', o.kind,
        'related_card_id', o.related_card_id,
        'action', o.action,
        'baseline_stub', o.baseline_stub
      ))), '[]'::jsonb)
      INTO v_old
      FROM card_relationship_overrides o
      WHERE o.card_id = v_target_id;
    END IF;

    v_patch := admin__apply_relationship_delta(
      v_target_id,
      v_old,
      coalesce(p_entries, '[]'::jsonb)
    );
    PERFORM admin__apply_card_patch(v_target_id, v_patch);
  END LOOP;

  IF v_all THEN
    DELETE FROM card_relationship_overrides
    WHERE oracle_key = v_oracle
       OR card_id IN (
         SELECT c.id
         FROM cards c
         WHERE coalesce(c.oracle_key, card_oracle_key(c.name)) = v_oracle
       );

    INSERT INTO card_relationship_overrides
      (card_id, oracle_key, kind, related_card_id, action, created_by, baseline_stub)
    SELECT DISTINCT
      NULL,
      v_oracle,
      e->>'kind',
      e->>'related_card_id',
      e->>'action',
      p_actor,
      CASE WHEN e->>'action' = 'remove' THEN (
        SELECT snapshot->'stub'
        FROM jsonb_array_elements(v_snapshots) snapshot
        WHERE snapshot->>'kind' = e->>'kind'
          AND snapshot->>'related_card_id' = e->>'related_card_id'
        LIMIT 1
      ) ELSE NULL END
    FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e;
  ELSE
    DELETE FROM card_relationship_overrides WHERE card_id = p_card_id;

    INSERT INTO card_relationship_overrides
      (card_id, oracle_key, kind, related_card_id, action, created_by, baseline_stub)
    SELECT DISTINCT
      p_card_id,
      NULL,
      e->>'kind',
      e->>'related_card_id',
      e->>'action',
      p_actor,
      CASE WHEN e->>'action' = 'remove' THEN (
        SELECT snapshot->'stub'
        FROM jsonb_array_elements(v_snapshots) snapshot
        WHERE snapshot->>'kind' = e->>'kind'
          AND snapshot->>'related_card_id' = e->>'related_card_id'
        LIMIT 1
      ) ELSE NULL END
    FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e;
  END IF;

  PERFORM admin__log(
    p_actor, 'card.relationships', 'card', p_card_id,
    jsonb_strip_nulls(jsonb_build_object(
      'entries', coalesce(p_entries, '[]'::jsonb),
      'scope', v_scope,
      'oracle_key', v_oracle,
      'all_printings', v_all
    ))
  );

  RETURN jsonb_build_object(
    'ok', true,
    'card_id', p_card_id,
    'scope', v_scope,
    'oracle_key', v_oracle
  );
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Restated for a fresh database; a replace of the existing function keeps them.
REVOKE ALL ON FUNCTION admin_set_card_relationships(text, jsonb, boolean, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION admin_set_card_relationships(text, jsonb, boolean, uuid)
  TO service_role;
