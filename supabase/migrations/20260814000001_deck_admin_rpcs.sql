-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  Admin RPCs for format rules, severity overrides and legality notes     │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Reader: `/admin/formats` reads `format_zone_rules` and
-- `format_legality_severities` through `GET /admin/formats`, and the card
-- editor's legality panel reads a stored `note` through
-- `legalities_for_printing`. The deck builder reads the same three things to
-- validate a deck and to explain a violation in its tooltip.
--
-- Writer: the admin format and legality routes in packages/api, through the
-- four functions below. Phase 1 shipped the tables and the `note` column with
-- no way to write either from the application — this migration is that half.
--
-- Adds no column. Two of these functions replace existing ones:
--
--   * `admin_set_legality` gains `p_note` and accepts the `restricted` status
--     the phase-1 CHECK constraints already allow. The old five-argument
--     signature is dropped rather than left beside the new one: PostgREST
--     resolves an RPC by the argument names it is sent, and two overloads that
--     differ only by an optional argument make the missing-`note` call
--     ambiguous rather than defaulting.
--   * `legalities_for_printing` returns the note belonging to the row that
--     decided the status, on the same `printing → oracle → default` precedence
--     as the status itself. A note whose row lost the precedence contest is not
--     the explanation for what the card actually is.

-- ── admin: format zone rules ──────────────────────────────────────────────────
--
-- NULL is the point of this table: a NULL bound means unconstrained, which is
-- not the same as zero, so every count parameter is passed through untouched
-- rather than coalesced. A format with no rows constrains nothing at all.

CREATE OR REPLACE FUNCTION admin_set_format_zone_rule(
  p_code       text,
  p_zone       text,
  p_min_count  integer,
  p_max_count  integer,
  p_copy_limit integer,
  p_actor      uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_code      text := lower(btrim(p_code));
  v_format_id uuid;
BEGIN
  SELECT id INTO v_format_id FROM formats WHERE code = v_code;
  IF v_format_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;

  IF p_zone IS NULL OR p_zone NOT IN
     ('legend', 'main', 'sideboard', 'runes', 'battlefields', 'considering') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_zone');
  END IF;

  -- Caught here rather than left to the table's CHECK constraints, so the
  -- caller gets a reason string it can render instead of a 23514 the route
  -- would have to report as an unexplained failure.
  IF coalesce(p_min_count, 0) < 0 OR coalesce(p_max_count, 0) < 0
     OR coalesce(p_copy_limit, 0) < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_count');
  END IF;
  IF p_min_count IS NOT NULL AND p_max_count IS NOT NULL
     AND p_min_count > p_max_count THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_range');
  END IF;

  INSERT INTO format_zone_rules (format_id, zone, min_count, max_count, copy_limit)
  VALUES (v_format_id, p_zone, p_min_count, p_max_count, p_copy_limit)
  ON CONFLICT (format_id, zone)
  DO UPDATE SET min_count  = excluded.min_count,
                max_count  = excluded.max_count,
                copy_limit = excluded.copy_limit;

  PERFORM admin__log(p_actor, 'format.zone_rule', 'format', v_code,
                     jsonb_build_object('zone', p_zone,
                                        'min_count', p_min_count,
                                        'max_count', p_max_count,
                                        'copy_limit', p_copy_limit));
  RETURN jsonb_build_object('ok', true, 'code', v_code, 'zone', p_zone,
                            'min_count', p_min_count,
                            'max_count', p_max_count,
                            'copy_limit', p_copy_limit);
END;
$$;

-- Idempotent: removing a rule that is not there leaves the zone unconstrained,
-- which is exactly what the caller asked for. `deleted` reports whether a row
-- actually went, so the UI can stay quiet about a no-op.
CREATE OR REPLACE FUNCTION admin_delete_format_zone_rule(
  p_code  text,
  p_zone  text,
  p_actor uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_code      text := lower(btrim(p_code));
  v_format_id uuid;
  v_deleted   integer;
BEGIN
  SELECT id INTO v_format_id FROM formats WHERE code = v_code;
  IF v_format_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;

  IF p_zone IS NULL OR p_zone NOT IN
     ('legend', 'main', 'sideboard', 'runes', 'battlefields', 'considering') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_zone');
  END IF;

  DELETE FROM format_zone_rules
  WHERE format_id = v_format_id AND zone = p_zone;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  PERFORM admin__log(p_actor, 'format.zone_rule.delete', 'format', v_code,
                     jsonb_build_object('zone', p_zone, 'deleted', v_deleted > 0));
  RETURN jsonb_build_object('ok', true, 'code', v_code, 'zone', p_zone,
                            'deleted', v_deleted > 0);
END;
$$;

-- ── admin: format legality severities ─────────────────────────────────────────
--
-- A NULL severity deletes the override so the status falls back to
-- DEFAULT_LEGALITY_SEVERITY in @riftseer/types. Storing a row that merely
-- repeats the default would make the table a second copy of the mapping, and
-- the next status added to the vocabulary would need backfilling everywhere.

CREATE OR REPLACE FUNCTION admin_set_format_legality_severity(
  p_code     text,
  p_status   text,
  p_severity text,
  p_actor    uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_code      text := lower(btrim(p_code));
  v_format_id uuid;
BEGIN
  SELECT id INTO v_format_id FROM formats WHERE code = v_code;
  IF v_format_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;

  IF p_status IS NULL OR p_status NOT IN
     ('legal', 'restricted', 'not_legal', 'banned') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;
  IF p_severity IS NOT NULL AND p_severity NOT IN ('none', 'warning', 'error') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_severity');
  END IF;

  IF p_severity IS NULL THEN
    DELETE FROM format_legality_severities
    WHERE format_id = v_format_id AND status = p_status;
  ELSE
    INSERT INTO format_legality_severities (format_id, status, severity)
    VALUES (v_format_id, p_status, p_severity)
    ON CONFLICT (format_id, status)
    DO UPDATE SET severity = excluded.severity;
  END IF;

  PERFORM admin__log(p_actor, 'format.legality_severity', 'format', v_code,
                     jsonb_build_object('status', p_status, 'severity', p_severity));
  RETURN jsonb_build_object('ok', true, 'code', v_code, 'status', p_status,
                            'severity', p_severity);
END;
$$;

-- ── admin: legalities, with `restricted` and a note ───────────────────────────
--
-- Unchanged from the baseline apart from the note and the fourth status: one
-- function for both scopes, and an oracle-scoped write still clears every
-- printing exception in that format so a card-wide decision is not silently
-- overruled by a stale row.

CREATE OR REPLACE FUNCTION admin_set_legality(
  p_oracle_id   uuid,
  p_printing_id text,
  p_format_code text,
  p_status      text,
  p_note        text,
  p_actor       uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_format_id uuid;
  v_note      text := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
  SELECT id INTO v_format_id FROM formats WHERE code = lower(p_format_code);
  IF v_format_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'format_not_found');
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN
     ('legal', 'restricted', 'not_legal', 'banned') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  IF p_printing_id IS NOT NULL THEN
    IF p_status IS NULL THEN
      DELETE FROM printing_legalities
      WHERE printing_id = p_printing_id AND format_id = v_format_id;
    ELSE
      INSERT INTO printing_legalities (printing_id, format_id, status, note, updated_by)
      VALUES (p_printing_id, v_format_id, p_status, v_note, p_actor)
      ON CONFLICT (printing_id, format_id)
      DO UPDATE SET status = excluded.status, note = excluded.note,
                    updated_by = excluded.updated_by, updated_at = now();
    END IF;
    PERFORM admin__log(p_actor, 'printing.legality', 'printing', p_printing_id,
                       jsonb_build_object('format', p_format_code, 'status', p_status,
                                          'note', v_note));
    RETURN jsonb_build_object('ok', true, 'scope', 'printing', 'printing_id', p_printing_id);
  END IF;

  -- Absence means legal at oracle level, so 'legal' is a delete rather than a
  -- stored row — and a note has nowhere to live without a row, which is why the
  -- note belongs to a status rather than to a card.
  IF p_status IS NULL OR p_status = 'legal' THEN
    DELETE FROM oracle_legalities WHERE oracle_id = p_oracle_id AND format_id = v_format_id;
  ELSE
    INSERT INTO oracle_legalities (oracle_id, format_id, status, note, updated_by)
    VALUES (p_oracle_id, v_format_id, p_status, v_note, p_actor)
    ON CONFLICT (oracle_id, format_id)
    DO UPDATE SET status = excluded.status, note = excluded.note,
                  updated_by = excluded.updated_by, updated_at = now();
  END IF;

  DELETE FROM printing_legalities pl
  USING printings p
  WHERE pl.printing_id = p.id AND p.oracle_id = p_oracle_id AND pl.format_id = v_format_id;

  PERFORM admin__log(p_actor, 'oracle.legality', 'oracle', p_oracle_id::text,
                     jsonb_build_object('format', p_format_code, 'status', p_status,
                                        'note', v_note));
  RETURN jsonb_build_object('ok', true, 'scope', 'oracle', 'oracle_id', p_oracle_id);
END;
$$;

DROP FUNCTION IF EXISTS admin_set_legality(uuid, text, text, text, uuid);

-- The note rides on the same precedence as the status: whichever row decided
-- the answer also supplies the explanation for it.
CREATE OR REPLACE FUNCTION legalities_for_printing(p_printing_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x.sort_order, x.name), '[]'::jsonb)
  FROM (
    SELECT f.id AS format_id, f.code AS format_code, f.name, f.sort_order,
           coalesce(pl.status, ol.status, 'legal') AS status,
           CASE WHEN pl.status IS NOT NULL THEN 'printing'
                WHEN ol.status IS NOT NULL THEN 'oracle'
                ELSE 'default' END AS scope,
           CASE WHEN pl.status IS NOT NULL THEN pl.note
                WHEN ol.status IS NOT NULL THEN ol.note
                ELSE NULL END AS note
    FROM formats f
    CROSS JOIN printings p
    LEFT JOIN printing_legalities pl
      ON pl.printing_id = p.id AND pl.format_id = f.id
    LEFT JOIN oracle_legalities ol
      ON ol.oracle_id = p.oracle_id AND ol.format_id = f.id
    WHERE p.id = p_printing_id AND f.active
  ) x;
$$;

-- ── grants ────────────────────────────────────────────────────────────────────
--
-- Every function here, including the two replaced ones: an admin RPC without an
-- EXECUTE grant to service_role is unreachable from the Worker.

DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'admin_set_format_zone_rule(text, text, integer, integer, integer, uuid)',
    'admin_delete_format_zone_rule(text, text, uuid)',
    'admin_set_format_legality_severity(text, text, text, uuid)',
    'admin_set_legality(uuid, text, text, text, text, uuid)',
    'legalities_for_printing(text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', v_fn);
  END LOOP;
END
$$;
