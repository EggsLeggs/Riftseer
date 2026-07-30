-- Ingest rewrite Phase 6: TCGPlayer review / reconciliation queue.
--
-- RiftCodex is authoritative; TCGPlayer only enriches. When ingest finds a
-- TCGPlayer product it cannot attach to a card, or a field where TCGPlayer
-- disagrees with what we hold, it files the discrepancy here instead of acting
-- on it. Nothing in this file ever changes a card by itself — an admin confirms
-- (which writes a durable card override) or dismisses (which is remembered, so
-- the next ingest does not resurface it).
--
-- Prices are deliberately never queued: they change every run, are expected to
-- differ, and are already applied automatically.
--
-- Service-role-only, like the rest of the schema. The API gates callers on
-- ADMIN_USER_IDS before any of these functions is reached.

-- ── reconciliation_queue ──────────────────────────────────────────────────────
-- `fingerprint` is the identity of a *discrepancy*, not of a row: ingest
-- recomputes it every run, so an entry that is still true is updated in place
-- rather than duplicated. It encodes the observed upstream value, so a genuinely
-- new disagreement gets a new fingerprint and re-surfaces even after the old one
-- was dismissed.
--
-- No FK to cards(id): `proposed_card_id` is a suggestion, and the row must
-- survive the card being pruned and re-ingested.
CREATE TABLE IF NOT EXISTS reconciliation_queue (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             text        NOT NULL CHECK (kind IN ('unmatched_product', 'field_diff')),
  fingerprint      text        NOT NULL UNIQUE,
  tcgplayer_payload jsonb      NOT NULL DEFAULT '{}'::jsonb,
  proposed_card_id text,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'confirmed', 'dismissed')),
  note             text,
  resolved_by      uuid,
  resolved_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- Bumped on every ingest that still observes the discrepancy, so a stale
  -- dismissed row can be told from one upstream keeps re-asserting.
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE reconciliation_queue ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS reconciliation_queue_updated_at ON reconciliation_queue;
CREATE TRIGGER reconciliation_queue_updated_at
  BEFORE UPDATE ON reconciliation_queue
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- The review page reads one status at a time, newest first.
CREATE INDEX IF NOT EXISTS reconciliation_queue_status_idx
  ON reconciliation_queue (status, created_at DESC);
CREATE INDEX IF NOT EXISTS reconciliation_queue_kind_idx
  ON reconciliation_queue (kind);
CREATE INDEX IF NOT EXISTS reconciliation_queue_card_idx
  ON reconciliation_queue (proposed_card_id)
  WHERE proposed_card_id IS NOT NULL;

-- ── ingest_reconciliation_queue ───────────────────────────────────────────────
-- Called by the ingest worker with every discrepancy the run observed.
--
-- Pending rows are refreshed in place. Rows an admin has already resolved are
-- left completely alone — that is what makes a dismissal stick across ingests,
-- and what stops a confirmed entry from reopening.
--
-- Pruning is a separate concern from upserting, exactly as in
-- `ingest_card_data_v2`: the worker sends bounded entry batches with
-- `p_prune = false`, then one final call carrying the complete fingerprint list.
-- `p_prune` deletes pending rows that list no longer contains, so an entry that
-- resolves itself upstream disappears. The worker passes false whenever the
-- TCGPlayer fetch failed, because an empty observation set would otherwise read
-- as "everything matched" and clear the whole queue.
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
      e->>'fingerprint'                     AS fingerprint,
      e->>'kind'                            AS kind,
      coalesce(e->'tcgplayer_payload', '{}'::jsonb) AS payload,
      NULLIF(e->>'proposed_card_id', '')    AS proposed_card_id
    FROM jsonb_array_elements(v_entries) e
    WHERE NULLIF(e->>'fingerprint', '') IS NOT NULL
      AND e->>'kind' IN ('unmatched_product', 'field_diff')
    ORDER BY e->>'fingerprint'
  ),
  upserted AS (
    INSERT INTO reconciliation_queue AS q
      (kind, fingerprint, tcgplayer_payload, proposed_card_id, last_seen_at)
    SELECT kind, fingerprint, payload, proposed_card_id, now() FROM incoming
    ON CONFLICT (fingerprint) DO UPDATE SET
      -- Only a still-open entry is refreshed; a resolved one keeps the payload
      -- the admin actually acted on.
      kind              = EXCLUDED.kind,
      tcgplayer_payload = EXCLUDED.tcgplayer_payload,
      proposed_card_id  = EXCLUDED.proposed_card_id,
      last_seen_at      = now()
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

-- ── admin_resolve_reconciliation_entry ────────────────────────────────────────
-- Confirm or dismiss one entry.
--
--   dismiss → the row is marked and never re-surfaces; no card is touched.
--   confirm → `p_patch` is applied through admin__patch_card, so the change is
--             live immediately *and* stored in card_overrides, which is what
--             makes the link survive the next ingest.
--
-- The patch is built by the API in TypeScript rather than here: a patch that
-- changes `name` must also carry `name_normalized` and `oracle_key`, and those
-- derivations live in @riftseer/types, not in SQL. An empty patch is allowed —
-- confirming is then purely a record that the entry was reviewed and accepted.
--
-- Only pending entries can be resolved. Re-resolving would re-apply the patch
-- against data that may have moved on since, so a resolved row is rejected and
-- the admin edits the card directly instead.
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
        coalesce(NULLIF(btrim(p_note), ''), 'Confirmed from the TCGPlayer review queue'),
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

-- ── Grants ────────────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE reconciliation_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE reconciliation_queue TO service_role;

DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'ingest_reconciliation_queue(jsonb, jsonb, boolean)',
    'admin_resolve_reconciliation_entry(uuid, text, text, jsonb, text, uuid)'
  ]
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END;
$$;
