-- ── Relationship override scopes ──────────────────────────────────────────────
-- Dual-scope relationship overrides, mirroring format legalities:
--
--   * oracle-scoped rows (`oracle_key` set, `card_id` NULL) apply to every
--     printing that currently has that key, including printings that arrive
--     later via ingest.
--   * printing-scoped rows (`card_id` set, `oracle_key` NULL) are exceptions
--     for one printing only.
--
-- Apply order (ingest and admin live reconcile): auto-link → oracle → printing.
-- Existing rows stay printing-scoped; no data rewrite.

-- ── Schema ────────────────────────────────────────────────────────────────────
ALTER TABLE card_relationship_overrides
  ALTER COLUMN card_id DROP NOT NULL;

ALTER TABLE card_relationship_overrides
  ADD COLUMN IF NOT EXISTS oracle_key text;

ALTER TABLE card_relationship_overrides
  DROP CONSTRAINT IF EXISTS card_relationship_overrides_card_id_kind_related_card_id_action_key;

-- Exactly one scope column is set.
ALTER TABLE card_relationship_overrides
  DROP CONSTRAINT IF EXISTS card_relationship_overrides_scope_check;
ALTER TABLE card_relationship_overrides
  ADD CONSTRAINT card_relationship_overrides_scope_check
  CHECK ((card_id IS NOT NULL) <> (oracle_key IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS card_relationship_overrides_printing_uidx
  ON card_relationship_overrides (card_id, kind, related_card_id, action)
  WHERE card_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS card_relationship_overrides_oracle_uidx
  ON card_relationship_overrides (oracle_key, kind, related_card_id, action)
  WHERE oracle_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS card_relationship_overrides_oracle_key_idx
  ON card_relationship_overrides (oracle_key)
  WHERE oracle_key IS NOT NULL;

-- ── admin__apply_relationship_delta ───────────────────────────────────────────
-- Rebuild one card's live relationship arrays from a prior override set and the
-- replacement set. Returns a patch object keyed by relationship kind.
--
-- `p_old_entries` / `p_new_entries` are arrays of
-- `{ kind, related_card_id, action, baseline_stub? }`. Only the overrides being
-- replaced belong here — oracle rows stay out of a printing-scoped PUT so their
-- already-baked live effects are left alone.
CREATE OR REPLACE FUNCTION admin__apply_relationship_delta(
  p_card_id     text,
  p_old_entries jsonb,
  p_new_entries jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_kinds   text[] := ARRAY[
    'all_parts', 'used_by', 'related_champions',
    'related_legends', 'related_signatures', 'related_printings'
  ];
  v_kind    text;
  v_entry   jsonb;
  v_current jsonb;
  v_stub    jsonb;
  v_drop    text[];
  v_patch   jsonb := '{}'::jsonb;
BEGIN
  FOREACH v_kind IN ARRAY v_kinds
  LOOP
    SELECT coalesce(array_agg(id), ARRAY[]::text[]) INTO v_drop
    FROM (
      SELECT e->>'related_card_id' AS id
      FROM jsonb_array_elements(coalesce(p_new_entries, '[]'::jsonb)) e
      WHERE e->>'kind' = v_kind AND e->>'action' = 'remove'
      UNION
      SELECT o->>'related_card_id'
      FROM jsonb_array_elements(coalesce(p_old_entries, '[]'::jsonb)) o
      WHERE o->>'kind' = v_kind
        AND o->>'action' = 'add'
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(coalesce(p_new_entries, '[]'::jsonb)) e2
          WHERE e2->>'kind' = v_kind
            AND e2->>'action' = 'add'
            AND e2->>'related_card_id' = o->>'related_card_id'
        )
    ) drops;

    EXECUTE format('SELECT coalesce(%I, ''[]''::jsonb) FROM cards WHERE id = $1', v_kind)
      INTO v_current USING p_card_id;

    SELECT coalesce(jsonb_agg(stub), '[]'::jsonb) INTO v_current
    FROM jsonb_array_elements(v_current) stub
    WHERE NOT (stub->>'id' = ANY (v_drop));

    FOR v_entry IN
      SELECT * FROM jsonb_array_elements(coalesce(p_new_entries, '[]'::jsonb)) e
      WHERE e->>'kind' = v_kind AND e->>'action' = 'add'
    LOOP
      -- Expanding an oracle add across the group must not self-link a printing
      -- that happens to be the related target.
      IF v_entry->>'related_card_id' = p_card_id THEN
        CONTINUE;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_current) existing
        WHERE existing->>'id' = v_entry->>'related_card_id'
      ) THEN
        v_stub := admin__related_stub(v_entry->>'related_card_id', v_kind);
        IF v_stub IS NOT NULL THEN
          v_current := v_current || jsonb_build_array(v_stub);
        END IF;
      END IF;
    END LOOP;

    -- Revoked removes: restore when the prior override captured a real baseline.
    FOR v_entry IN
      SELECT o
      FROM jsonb_array_elements(coalesce(p_old_entries, '[]'::jsonb)) o
      WHERE o->>'kind' = v_kind
        AND o->>'action' = 'remove'
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(coalesce(p_new_entries, '[]'::jsonb)) e3
          WHERE e3->>'kind' = v_kind
            AND e3->>'action' = 'remove'
            AND e3->>'related_card_id' = o->>'related_card_id'
        )
    LOOP
      IF v_entry->>'related_card_id' = p_card_id THEN
        CONTINUE;
      END IF;
      IF jsonb_typeof(v_entry->'baseline_stub') = 'object'
         AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_current) existing
        WHERE existing->>'id' = v_entry->>'related_card_id'
      ) THEN
        v_stub := admin__related_stub(v_entry->>'related_card_id', v_kind);
        IF v_stub IS NOT NULL THEN
          v_current := v_current || jsonb_build_array(v_stub);
        END IF;
      END IF;
    END LOOP;

    v_patch := v_patch || jsonb_build_object(v_kind, v_current);
  END LOOP;

  RETURN v_patch;
END;
$$;

-- ── admin_set_card_relationships ──────────────────────────────────────────────
-- Signature gains `p_all_printings` (default true at the API).
--
--   true  → replace oracle-scoped rows for the card's oracle_key; clear every
--           printing-scoped exception in the group; reconcile all printings.
--   false → replace only this printing's exceptions; leave oracle rows alone;
--           reconcile this printing only.
DROP FUNCTION IF EXISTS admin_set_card_relationships(text, jsonb, uuid);

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

  PERFORM 1 FROM cards WHERE id = p_card_id FOR UPDATE;
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

    -- Serialize siblings before snapshotting their live arrays.
    PERFORM 1 FROM cards c WHERE c.id = ANY (v_card_ids) FOR UPDATE;
  ELSE
    v_scope := 'printing';
    v_card_ids := ARRAY[p_card_id];
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

-- ── admin_list_card_relationships ─────────────────────────────────────────────
-- Layered override lists for the editor. Live arrays are on the card payload;
-- this returns only the durable override rows.
CREATE OR REPLACE FUNCTION admin_list_card_relationships(p_card_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_oracle text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cards WHERE id = p_card_id) THEN
    RETURN NULL;
  END IF;
  v_oracle := admin__card_oracle_key(p_card_id);

  RETURN jsonb_build_object(
    'card_id', p_card_id,
    'oracle_key', v_oracle,
    'oracle_entries', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', o.kind,
        'related_card_id', o.related_card_id,
        'action', o.action
      ) ORDER BY o.created_at, o.id)
      FROM card_relationship_overrides o
      WHERE o.oracle_key = v_oracle
    ), '[]'::jsonb),
    'printing_entries', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', o.kind,
        'related_card_id', o.related_card_id,
        'action', o.action
      ) ORDER BY o.created_at, o.id)
      FROM card_relationship_overrides o
      WHERE o.card_id = p_card_id
    ), '[]'::jsonb)
  );
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'admin__apply_relationship_delta(text, jsonb, jsonb)',
    'admin_set_card_relationships(text, jsonb, boolean, uuid)',
    'admin_list_card_relationships(text)'
  ]
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END;
$$;
