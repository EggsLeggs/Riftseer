-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  Refresh rule-scoped ruling matches for a single card                   │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Phase 7 refreshes every query target at the end of an ingest, which covers
-- newly released printings. It does not cover a card an admin creates or edits
-- in between: with the production cron at `0 */6 * * *`, a manual card carrying
-- `[Deathknell]` could sit for six hours before a rule targeting
-- `t:unit kw:deathknell` picked it up.
--
-- This is the per-card counterpart, called by the admin card mutations. It is
-- deliberately *not* a trigger on `cards`: ingest writes ~1500 rows per run and
-- already does one bulk refresh at the end, so per-row evaluation there would be
-- pure waste.

CREATE OR REPLACE FUNCTION refresh_ruling_matches_for_card(p_card_id text)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  t         record;
  v_where   text;
  v_sql     text;
  v_match   boolean;
  v_checked int := 0;
  v_matched int := 0;
  v_skipped int := 0;
BEGIN
  IF NULLIF(btrim(coalesce(p_card_id, '')), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_required');
  END IF;

  -- A deleted or not-yet-visible card has no memberships to hold.
  IF NOT EXISTS (SELECT 1 FROM cards WHERE id = p_card_id) THEN
    DELETE FROM card_ruling_matches WHERE card_id = p_card_id;
    RETURN jsonb_build_object('ok', true, 'card_id', p_card_id, 'checked', 0, 'matched', 0);
  END IF;

  FOR t IN
    SELECT tg.id, tg.ast
    FROM card_ruling_targets tg
    JOIN card_rulings r ON r.id = tg.ruling_id
    WHERE tg.kind = 'query' AND r.active
  LOOP
    BEGIN
      v_where := card_search_ast_to_sql(t.ast);
    EXCEPTION WHEN OTHERS THEN
      -- Same contract as the bulk refresh: a rule whose AST no longer renders
      -- keeps its existing matches rather than costing every other rule.
      v_skipped := v_skipped + 1;
      CONTINUE;
    END;

    BEGIN
      v_sql :=
        'SELECT EXISTS (SELECT 1 FROM cards c ' ||
        'LEFT JOIN artists a ON a.id = c.artist_id ' ||
        'WHERE c.id = ' || quote_literal(p_card_id) ||
        ' AND (' || v_where || '))';
      EXECUTE v_sql INTO v_match;

      IF v_match THEN
        INSERT INTO card_ruling_matches (target_id, card_id)
        VALUES (t.id, p_card_id)
        ON CONFLICT DO NOTHING;
        v_matched := v_matched + 1;
      ELSE
        -- An edit can move a card *out* of a rule as easily as into it.
        DELETE FROM card_ruling_matches
        WHERE target_id = t.id AND card_id = p_card_id;
      END IF;

      v_checked := v_checked + 1;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',      true,
    'card_id', p_card_id,
    'checked', v_checked,
    'matched', v_matched,
    'skipped', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION refresh_ruling_matches_for_card(text) FROM PUBLIC;
