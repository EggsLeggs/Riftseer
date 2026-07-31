-- ── Admin RPC not-found reasons ───────────────────────────────────────────────
-- Three admin RPCs from 20260730120000_phase3_admin_api.sql reported client
-- mistakes as server faults, or as success:
--
--   * admin_move_card and admin__patch_card raised on an unknown set_code. The
--     API surfaced that as a 500, even though mutationFailure already maps a
--     'set_not_found' reason to 404.
--   * admin_delete_card never checked that the card existed. An unknown id
--     still wrote a card_deletions tombstone and an audit entry and returned
--     ok. The tombstone is durable, so it would suppress that id permanently
--     if a real card ever arrived under it.
--
-- Only the two jsonb-returning wrappers change. admin__apply_card_patch keeps
-- its boolean signature and its internal raise as a backstop for the callers
-- that PERFORM it — and a later migration redefines that function, so leaving
-- it untouched here keeps the two independent.
--
-- Every statement is CREATE OR REPLACE with an unchanged signature, so existing
-- privileges granted by the phase 3 migration are preserved.
--
-- The version is deliberately later than the phase 5-7 migrations further up the
-- stack, even though the fix belongs to phase 3. One database backs the whole
-- stack, so a migration added to a lower branch with an earlier timestamp is
-- permanently out of order against what is already deployed, and `db push`
-- refuses it. Dating it last keeps it a normal pending migration from the tip.

-- ── admin__patch_card ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin__patch_card(
  p_card_id text,
  p_patch   jsonb,
  p_note    text,
  p_actor   uuid,
  p_action  text
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_patch jsonb;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;

  -- Checked before the patch is applied so the caller sees a reason instead of
  -- the raise inside admin__apply_card_patch.
  IF p_patch #> '{set,set_code}' IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM sets WHERE set_code = p_patch #>> '{set,set_code}'
     ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_not_found');
  END IF;

  IF NOT admin__apply_card_patch(p_card_id, p_patch) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;

  INSERT INTO card_overrides (card_id, patch, note, edited_by, updated_at)
  VALUES (p_card_id, p_patch, p_note, p_actor, now())
  ON CONFLICT (card_id) DO UPDATE SET
    patch      = jsonb_compose_merge_patch(card_overrides.patch, EXCLUDED.patch),
    note       = coalesce(EXCLUDED.note, card_overrides.note),
    edited_by  = EXCLUDED.edited_by,
    updated_at = now()
  RETURNING patch INTO v_patch;

  PERFORM admin__log(p_actor, p_action, 'card', p_card_id, p_patch);

  RETURN jsonb_build_object('ok', true, 'card_id', p_card_id, 'patch', v_patch);
END;
$$;

-- ── admin_move_card ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_move_card(
  p_card_id  text,
  p_set_code text,
  p_actor    uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_set sets;
BEGIN
  SELECT * INTO v_set FROM sets WHERE set_code = p_set_code;
  IF v_set.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_not_found');
  END IF;

  -- Patch the whole nested Card.set object so the durable override carries the
  -- set metadata ingest would otherwise rebuild from the joined row.
  RETURN admin__patch_card(
    p_card_id,
    jsonb_build_object('set', jsonb_strip_nulls(jsonb_build_object(
      'set_code', v_set.set_code,
      'set_name', v_set.set_name,
      'set_uri', v_set.set_uri,
      'set_search_uri', v_set.set_search_uri,
      'published_on', to_char(v_set.published_on, 'YYYY-MM-DD')
    ))),
    'moved to set ' || v_set.set_code,
    p_actor,
    'card.move'
  );
END;
$$;

-- ── admin_delete_card ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_delete_card(
  p_card_id text,
  p_reason  text,
  p_actor   uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- manual_cards is checked too: a manual card may exist there before ingest
  -- has materialised it into cards, and deleting it is still legitimate.
  IF NOT EXISTS (SELECT 1 FROM cards WHERE id = p_card_id)
     AND NOT EXISTS (SELECT 1 FROM manual_cards WHERE id = p_card_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;

  INSERT INTO card_deletions (card_id, deleted_by, reason)
  VALUES (p_card_id, p_actor, p_reason)
  ON CONFLICT (card_id) DO UPDATE SET
    deleted_by = EXCLUDED.deleted_by,
    reason     = coalesce(EXCLUDED.reason, card_deletions.reason);

  DELETE FROM cards WHERE id = p_card_id;

  PERFORM admin__log(
    p_actor, 'card.delete', 'card', p_card_id,
    jsonb_strip_nulls(jsonb_build_object('reason', p_reason))
  );

  RETURN jsonb_build_object('ok', true, 'card_id', p_card_id);
END;
$$;
