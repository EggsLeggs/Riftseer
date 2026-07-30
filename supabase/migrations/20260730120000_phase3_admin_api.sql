-- Ingest rewrite Phase 3: admin API support.
--
-- Every admin mutation must be BOTH immediate and durable, so each RPC below
-- writes an override/manual/deletion row *and* applies the same change to the
-- live cards/sets row in one transaction. The durable row is what makes the edit
-- survive the next ingest; the live update is what makes it visible now.
--
-- All functions are service-role-only: the API holds the service key and gates
-- callers on ADMIN_USER_IDS before ever reaching Postgres. RLS stays enabled with
-- no policies, matching the rest of the schema.

-- ── admin_audit_log ───────────────────────────────────────────────────────────
-- Append-only record of every admin mutation. `actor_id` is the Supabase user
-- UUID from the bearer token; `detail` holds the submitted payload so an edit can
-- be traced or reverted by hand.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          bigserial   PRIMARY KEY,
  actor_id    uuid        NOT NULL,
  action      text        NOT NULL,
  target_type text        NOT NULL,
  target_id   text,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx
  ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON admin_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx
  ON admin_audit_log (actor_id);

-- ── Durable set override layer ────────────────────────────────────────────────
-- Phase 1 established the equivalent card tables. Sets need the same three-way
-- model so POST/PATCH/DELETE remains authoritative after RiftCodex is ingested.
-- Deliberately no FK to sets(set_code): overrides and deletions must survive a
-- live row being removed and later restored.
CREATE TABLE IF NOT EXISTS set_overrides (
  set_code   text PRIMARY KEY,
  patch      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  note       text,
  edited_by  uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE set_overrides ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS manual_sets (
  set_code   text PRIMARY KEY,
  definition jsonb       NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE manual_sets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS set_deletions (
  set_code   text PRIMARY KEY,
  deleted_by uuid,
  reason     text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE set_deletions ENABLE ROW LEVEL SECURITY;

-- A remove override needs to remember whether a live relationship actually
-- existed before it was hidden. This lets a later PUT revoke the remove
-- immediately without inventing a relationship that was never auto-linked.
ALTER TABLE card_relationship_overrides
  ADD COLUMN IF NOT EXISTS baseline_stub jsonb;

-- ── jsonb_merge_patch ─────────────────────────────────────────────────────────
-- RFC 7396 JSON merge patch, matching the in-worker `mergePatch` in
-- packages/ingest-worker/src/pipeline/overrides-db.ts exactly: objects recurse,
-- a JSON `null` deletes the key, everything else replaces wholesale. Keeping the
-- two implementations aligned is what makes an override applied here identical to
-- the one ingest re-applies later.
CREATE OR REPLACE FUNCTION jsonb_merge_patch(p_target jsonb, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_key    text;
  v_value  jsonb;
BEGIN
  -- A non-object patch replaces the target outright.
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RETURN p_patch;
  END IF;

  IF p_target IS NULL OR jsonb_typeof(p_target) IS DISTINCT FROM 'object' THEN
    v_result := '{}'::jsonb;
  ELSE
    v_result := p_target;
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_patch)
  LOOP
    IF jsonb_typeof(v_value) = 'null' THEN
      v_result := v_result - v_key;
    ELSE
      v_result := jsonb_set(
        v_result,
        ARRAY[v_key],
        jsonb_merge_patch(v_result -> v_key, v_value),
        true
      );
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- Compose two merge-patch *documents*. This intentionally differs from
-- jsonb_merge_patch: JSON null is retained as a tombstone so a field deleted by
-- an admin is deleted again on every future ingest.
CREATE OR REPLACE FUNCTION jsonb_compose_merge_patch(
  p_existing jsonb,
  p_next     jsonb
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_key    text;
  v_value  jsonb;
BEGIN
  IF p_next IS NULL OR jsonb_typeof(p_next) IS DISTINCT FROM 'object' THEN
    RETURN p_next;
  END IF;

  IF p_existing IS NULL OR jsonb_typeof(p_existing) IS DISTINCT FROM 'object' THEN
    v_result := '{}'::jsonb;
  ELSE
    v_result := p_existing;
  END IF;

  FOR v_key, v_value IN SELECT key, value FROM jsonb_each(p_next)
  LOOP
    IF jsonb_typeof(v_value) = 'object'
       AND jsonb_typeof(v_result -> v_key) = 'object' THEN
      v_result := jsonb_set(
        v_result,
        ARRAY[v_key],
        jsonb_compose_merge_patch(v_result -> v_key, v_value),
        true
      );
    ELSE
      v_result := jsonb_set(v_result, ARRAY[v_key], v_value, true);
    END IF;
  END LOOP;

  RETURN v_result;
END;
$$;

-- ── admin__log ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin__log(
  p_actor       uuid,
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_detail      jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  INSERT INTO admin_audit_log (actor_id, action, target_type, target_id, detail)
  VALUES (p_actor, p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'::jsonb));
$$;

-- ── admin__resolve_artist ─────────────────────────────────────────────────────
-- Insert-or-get, mirroring the artist handling in ingest_card_data_v2.
CREATE OR REPLACE FUNCTION admin__resolve_artist(p_name text)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_name IS NULL OR p_name = '' THEN
    RETURN NULL;
  END IF;
  INSERT INTO artists (name) VALUES (p_name) ON CONFLICT (name) DO NOTHING;
  SELECT id INTO v_id FROM artists WHERE name = p_name;
  RETURN v_id;
END;
$$;

-- ── admin__related_stub ───────────────────────────────────────────────────────
-- Build the RelatedCard stub stored inside the relationship arrays. Field set and
-- `component` mapping match `toRelatedCard` in overrides-db.ts so a stub written
-- here is indistinguishable from one ingest writes.
CREATE OR REPLACE FUNCTION admin__related_stub(p_related_card_id text, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_component text;
  v_stub      jsonb;
BEGIN
  v_component := CASE p_kind
    WHEN 'all_parts'          THEN 'part'
    WHEN 'used_by'            THEN 'used_by'
    WHEN 'related_champions'  THEN 'champion'
    WHEN 'related_legends'    THEN 'legend'
    WHEN 'related_signatures' THEN 'signature'
    WHEN 'related_printings'  THEN 'printing'
  END;
  IF v_component IS NULL THEN
    RAISE EXCEPTION 'unknown relationship kind: %', p_kind;
  END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'object',           'related_card',
    'id',               c.id,
    'name',             c.name,
    'component',        v_component,
    'uri',              '/api/v1/cards/' || c.id,
    'set_code',         s.set_code,
    'collector_number', c.collector_number,
    'published_on',     coalesce(
                          to_char(s.published_on, 'YYYY-MM-DD'),
                          to_char(c.released_at, 'YYYY-MM-DD')
                        ),
    'alternate_art',    coalesce((c.metadata->>'alternate_art')::boolean, false)
  ))
  INTO v_stub
  FROM cards c
  LEFT JOIN sets s ON s.id = c.set_id
  WHERE c.id = p_related_card_id;

  RETURN v_stub;
END;
$$;

-- ── admin__apply_card_patch ───────────────────────────────────────────────────
-- Overlay a Card-shaped merge patch onto the live cards row, mapping Card fields
-- to columns the same way ingest_card_data_v2 does. jsonb columns are deep-merged
-- so a partial patch (e.g. only `media.source_url`) preserves its siblings;
-- relationship arrays are replaced wholesale when present.
--
-- Note: `name_normalized` is NOT derived here. Callers that change `name` must
-- send `name_normalized` too, computed with normalizeCardName() from
-- @riftseer/types/parser, so normalization lives in exactly one place.
-- Returns false when the card row does not exist.
CREATE OR REPLACE FUNCTION admin__apply_card_patch(p_card_id text, p_patch jsonb)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_set_code      text;
  v_set_id        uuid;
  v_touch_set     boolean := false;
  v_artist_name   text;
  v_artist_id     uuid;
  v_touch_artist  boolean := false;
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;

  -- Serialize all mutations for one card. Without the row lock, a concurrent
  -- delete could commit between this existence check and the UPDATE below,
  -- leaving a durable override for a live change that never happened.
  PERFORM 1 FROM cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- `set` arrives as the nested Card.set object; only set_code selects the FK.
  IF p_patch #> '{set,set_code}' IS NOT NULL THEN
    v_set_code := p_patch #>> '{set,set_code}';
    -- Hold a key-share lock until the card update has established its FK so a
    -- concurrent empty-set deletion cannot remove the destination underneath us.
    SELECT id
    INTO v_set_id
    FROM sets
    WHERE set_code = v_set_code
    FOR KEY SHARE;
    IF v_set_id IS NULL THEN
      RAISE EXCEPTION 'unknown set_code: %', v_set_code;
    END IF;
    v_touch_set := true;
  END IF;

  IF p_patch ? 'artist' THEN
    v_artist_name := NULLIF(p_patch->>'artist', '');
    v_artist_id := admin__resolve_artist(v_artist_name);
    v_touch_artist := true;
  END IF;

  UPDATE cards SET
    name = CASE WHEN p_patch ? 'name'
      THEN p_patch->>'name' ELSE name END,
    name_normalized = CASE WHEN p_patch ? 'name_normalized'
      THEN p_patch->>'name_normalized' ELSE name_normalized END,
    collector_number = CASE WHEN p_patch ? 'collector_number'
      THEN NULLIF(p_patch->>'collector_number', '') ELSE collector_number END,
    released_at = CASE WHEN p_patch ? 'released_at' THEN (
      CASE WHEN NULLIF(p_patch->>'released_at', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(p_patch->>'released_at', 10)::date
        ELSE NULL
      END
    ) ELSE released_at END,
    is_token = CASE WHEN p_patch ? 'is_token'
      THEN coalesce((p_patch->>'is_token')::boolean, false) ELSE is_token END,
    public_slug = CASE WHEN p_patch ? 'public_slug'
      THEN NULLIF(p_patch->>'public_slug', '') ELSE public_slug END,
    set_id    = CASE WHEN v_touch_set    THEN v_set_id    ELSE set_id    END,
    artist_id = CASE WHEN v_touch_artist THEN v_artist_id ELSE artist_id END,

    -- Deep-merged jsonb groups.
    external_ids = CASE WHEN p_patch ? 'external_ids'
      THEN coalesce(
        nullif(jsonb_merge_patch(external_ids, p_patch->'external_ids'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE external_ids END,
    attributes = CASE WHEN p_patch ? 'attributes'
      THEN coalesce(
        nullif(jsonb_merge_patch(attributes, p_patch->'attributes'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE attributes END,
    classification = CASE WHEN p_patch ? 'classification'
      THEN coalesce(
        nullif(jsonb_merge_patch(classification, p_patch->'classification'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE classification END,
    text = CASE WHEN p_patch ? 'text'
      THEN coalesce(
        nullif(jsonb_merge_patch(text, p_patch->'text'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE text END,
    metadata = CASE WHEN p_patch ? 'metadata'
      THEN coalesce(
        nullif(jsonb_merge_patch(metadata, p_patch->'metadata'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE metadata END,
    media = CASE WHEN p_patch ? 'media'
      THEN coalesce(
        nullif(jsonb_merge_patch(media, p_patch->'media'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE media END,
    purchase_uris = CASE WHEN p_patch ? 'purchase_uris'
      THEN coalesce(
        nullif(jsonb_merge_patch(purchase_uris, p_patch->'purchase_uris'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE purchase_uris END,
    prices = CASE WHEN p_patch ? 'prices'
      THEN coalesce(
        nullif(jsonb_merge_patch(prices, p_patch->'prices'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE prices END,

    -- Relationship arrays are replaced, not merged.
    all_parts = CASE WHEN jsonb_typeof(p_patch->'all_parts') = 'array'
      THEN p_patch->'all_parts' ELSE all_parts END,
    used_by = CASE WHEN jsonb_typeof(p_patch->'used_by') = 'array'
      THEN p_patch->'used_by' ELSE used_by END,
    related_champions = CASE WHEN jsonb_typeof(p_patch->'related_champions') = 'array'
      THEN p_patch->'related_champions' ELSE related_champions END,
    related_legends = CASE WHEN jsonb_typeof(p_patch->'related_legends') = 'array'
      THEN p_patch->'related_legends' ELSE related_legends END,
    related_signatures = CASE WHEN jsonb_typeof(p_patch->'related_signatures') = 'array'
      THEN p_patch->'related_signatures' ELSE related_signatures END,
    related_printings = CASE WHEN jsonb_typeof(p_patch->'related_printings') = 'array'
      THEN p_patch->'related_printings' ELSE related_printings END
  WHERE id = p_card_id;

  RETURN true;
END;
$$;

-- ── admin__patch_card ─────────────────────────────────────────────────────────
-- Internal implementation shared by ordinary patches, slug regeneration, moves,
-- and image replacement so each endpoint records a distinct audit action.
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

-- ── admin_patch_card ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_patch_card(
  p_card_id text,
  p_patch   jsonb,
  p_note    text,
  p_actor   uuid
) RETURNS jsonb
LANGUAGE sql
SET search_path = public
AS $$
  SELECT admin__patch_card(
    p_card_id,
    p_patch,
    p_note,
    p_actor,
    'card.patch'
  );
$$;

-- ── admin_create_manual_card ──────────────────────────────────────────────────
-- Register a full card definition in manual_cards (re-applied every ingest) and
-- materialise it as a live row with source='manual' so it is never pruned.
CREATE OR REPLACE FUNCTION admin_create_manual_card(
  p_id         text,
  p_definition jsonb,
  p_actor      uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_name       text;
  v_normalized text;
BEGIN
  IF NULLIF(btrim(p_id), '') IS NULL THEN
    RAISE EXCEPTION 'id must not be empty';
  END IF;
  IF p_definition IS NULL OR jsonb_typeof(p_definition) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'definition must be a JSON object';
  END IF;

  v_name := NULLIF(p_definition->>'name', '');
  v_normalized := NULLIF(p_definition->>'name_normalized', '');
  IF v_name IS NULL OR v_normalized IS NULL THEN
    RAISE EXCEPTION 'definition requires name and name_normalized';
  END IF;

  IF EXISTS (SELECT 1 FROM card_deletions WHERE card_id = p_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_deleted');
  END IF;
  IF EXISTS (SELECT 1 FROM cards WHERE id = p_id)
     OR EXISTS (SELECT 1 FROM manual_cards WHERE id = p_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_exists');
  END IF;

  INSERT INTO manual_cards (id, definition, created_by, created_at, updated_at)
  VALUES (p_id, p_definition, p_actor, now(), now());

  -- Seed the row, then reuse the shared column mapping for everything else.
  INSERT INTO cards (id, name, name_normalized, source, ingested_at)
  VALUES (p_id, v_name, v_normalized, 'manual', now());

  PERFORM admin__apply_card_patch(
    p_id,
    p_definition
  );

  PERFORM admin__log(p_actor, 'card.create_manual', 'card', p_id, p_definition);

  RETURN jsonb_build_object('ok', true, 'card_id', p_id);
END;
$$;

-- ── admin_delete_card ─────────────────────────────────────────────────────────
-- Record the deletion (so ingest never re-inserts it) and drop the live row.
CREATE OR REPLACE FUNCTION admin_delete_card(
  p_card_id text,
  p_reason  text,
  p_actor   uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
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

-- ── admin_restore_card ────────────────────────────────────────────────────────
-- Drop the deletion record. The row itself returns on the next ingest (or
-- immediately, for a manual card re-created via admin_create_manual_card).
CREATE OR REPLACE FUNCTION admin_restore_card(
  p_card_id text,
  p_actor   uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_deleted    integer;
  v_definition jsonb;
  v_override   jsonb;
  v_name        text;
  v_normalized  text;
BEGIN
  DELETE FROM card_deletions WHERE card_id = p_card_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT definition
  INTO v_definition
  FROM manual_cards
  WHERE id = p_card_id;

  IF v_definition IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM cards WHERE id = p_card_id) THEN
    v_name := NULLIF(v_definition->>'name', '');
    v_normalized := NULLIF(v_definition->>'name_normalized', '');
    IF v_name IS NULL OR v_normalized IS NULL THEN
      RAISE EXCEPTION 'manual card definition requires name and name_normalized';
    END IF;

    INSERT INTO cards (id, name, name_normalized, source, ingested_at)
    VALUES (p_card_id, v_name, v_normalized, 'manual', now());
    PERFORM admin__apply_card_patch(p_card_id, v_definition);
    SELECT patch INTO v_override
    FROM card_overrides
    WHERE card_id = p_card_id;
    IF v_override IS NOT NULL THEN
      PERFORM admin__apply_card_patch(p_card_id, v_override);
    END IF;
  END IF;

  PERFORM admin__log(p_actor, 'card.restore', 'card', p_card_id, '{}'::jsonb);

  RETURN jsonb_build_object(
    'ok', true,
    'card_id', p_card_id,
    'was_deleted', v_deleted > 0
  );
END;
$$;

-- ── admin_set_card_slug ───────────────────────────────────────────────────────
-- Force a new public_slug. ingest_card_data_v2 coalesces on conflict, which pins
-- whatever was persisted first, so the override row is required for the new slug
-- to survive: the worker's patch rewrites public_slug before the upsert.
CREATE OR REPLACE FUNCTION admin_set_card_slug(
  p_card_id text,
  p_slug    text,
  p_actor   uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_slug text;
BEGIN
  v_slug := NULLIF(btrim(p_slug), '');
  IF v_slug IS NULL THEN
    RAISE EXCEPTION 'slug must not be empty';
  END IF;
  IF EXISTS (SELECT 1 FROM cards WHERE public_slug = v_slug AND id <> p_card_id) THEN
    RAISE EXCEPTION 'slug already in use: %', v_slug USING ERRCODE = 'unique_violation';
  END IF;

  RETURN admin__patch_card(
    p_card_id,
    jsonb_build_object('public_slug', v_slug),
    'slug regenerated',
    p_actor,
    'card.regenerate_slug'
  );
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
    RAISE EXCEPTION 'unknown set_code: %', p_set_code;
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

-- ── admin_set_card_image ──────────────────────────────────────────────────────
-- The API first writes a content-addressed upload to R2, then calls this RPC to
-- atomically persist the admin source metadata and update the live card. The
-- Phase 2 queue publishes variants later and replaces the media_urls tombstone.
CREATE OR REPLACE FUNCTION admin_set_card_image(
  p_card_id text,
  p_media   jsonb,
  p_actor   uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_media IS NULL OR jsonb_typeof(p_media) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'media must be a JSON object';
  END IF;
  IF p_media->>'source_provider' IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'source_provider must be admin';
  END IF;
  IF NULLIF(p_media->>'source_url', '') IS NULL
     OR coalesce(p_media->>'source_hash', '') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'media requires source_url and a SHA-256 source_hash';
  END IF;

  RETURN admin__patch_card(
    p_card_id,
    jsonb_build_object('media', p_media),
    'admin image uploaded',
    p_actor,
    'card.image'
  );
END;
$$;

-- ── admin_set_card_relationships ──────────────────────────────────────────────
-- Replace every relationship override for one card with `p_entries`
-- (`[{ kind, related_card_id, action }, …]`) and reconcile the live arrays.
--
-- Live reconciliation is a delta, because the auto-linked baseline is computed by
-- the ingest worker and is not knowable here: new `add` entries are appended,
-- new `remove` entries and revoked `add` entries are stripped. A revoked remove
-- is restored immediately only when its persisted baseline_stub proves the
-- relationship existed; the next ingest rebuilds the exact automatic baseline.
CREATE OR REPLACE FUNCTION admin_set_card_relationships(
  p_card_id text,
  p_entries jsonb,
  p_actor   uuid
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
  v_snapshots jsonb := '[]'::jsonb;
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

  -- PUT replaces the whole override set, so serialize concurrent replacements
  -- and all other mutations of this card before snapshotting the live arrays.
  PERFORM 1 FROM cards WHERE id = p_card_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'card_not_found');
  END IF;

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

  -- Capture the current stub before applying each new remove. Preserve an old
  -- remove's snapshot across replacement PUTs. A prior manual add is not
  -- considered automatic baseline evidence.
  FOR v_entry IN
    SELECT *
    FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
    WHERE e->>'action' = 'remove'
  LOOP
    v_stub := NULL;

    SELECT o.baseline_stub
    INTO v_stub
    FROM card_relationship_overrides o
    WHERE o.card_id = p_card_id
      AND o.kind = v_entry->>'kind'
      AND o.related_card_id = v_entry->>'related_card_id'
      AND o.action = 'remove';

    IF v_stub IS NULL AND NOT EXISTS (
      SELECT 1
      FROM card_relationship_overrides o
      WHERE o.card_id = p_card_id
        AND o.kind = v_entry->>'kind'
        AND o.related_card_id = v_entry->>'related_card_id'
        AND o.action = 'add'
    ) THEN
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

  -- Per kind, rebuild the live array from the current value plus this delta.
  FOREACH v_kind IN ARRAY v_kinds
  LOOP
    -- IDs to strip: this kind's new removes, plus adds we previously wrote and
    -- that are absent from the new entry list.
    SELECT coalesce(array_agg(id), ARRAY[]::text[]) INTO v_drop
    FROM (
      SELECT e->>'related_card_id' AS id
      FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
      WHERE e->>'kind' = v_kind AND e->>'action' = 'remove'
      UNION
      SELECT o.related_card_id
      FROM card_relationship_overrides o
      WHERE o.card_id = p_card_id
        AND o.kind = v_kind
        AND o.action = 'add'
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e2
          WHERE e2->>'kind' = v_kind
            AND e2->>'action' = 'add'
            AND e2->>'related_card_id' = o.related_card_id
        )
    ) drops;

    EXECUTE format('SELECT coalesce(%I, ''[]''::jsonb) FROM cards WHERE id = $1', v_kind)
      INTO v_current USING p_card_id;

    SELECT coalesce(jsonb_agg(stub), '[]'::jsonb) INTO v_current
    FROM jsonb_array_elements(v_current) stub
    WHERE NOT (stub->>'id' = ANY (v_drop));

    FOR v_entry IN
      SELECT * FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e
      WHERE e->>'kind' = v_kind AND e->>'action' = 'add'
    LOOP
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

    -- If a previous remove override is omitted by this PUT, restore its stub
    -- immediately only when it captured a real baseline relationship.
    FOR v_entry IN
      SELECT jsonb_strip_nulls(jsonb_build_object(
        'related_card_id', o.related_card_id,
        'baseline_stub', o.baseline_stub
      ))
      FROM card_relationship_overrides o
      WHERE o.card_id = p_card_id
        AND o.kind = v_kind
        AND o.action = 'remove'
        AND NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) e3
          WHERE e3->>'kind' = v_kind
            AND e3->>'action' = 'remove'
            AND e3->>'related_card_id' = o.related_card_id
        )
    LOOP
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

  -- Overrides are authoritative for this card: replace them wholesale.
  DELETE FROM card_relationship_overrides WHERE card_id = p_card_id;
  INSERT INTO card_relationship_overrides
    (
      card_id,
      kind,
      related_card_id,
      action,
      created_by,
      baseline_stub
    )
  SELECT DISTINCT
    p_card_id,
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

  PERFORM admin__apply_card_patch(p_card_id, v_patch);
  PERFORM admin__log(
    p_actor, 'card.relationships', 'card', p_card_id,
    jsonb_build_object('entries', coalesce(p_entries, '[]'::jsonb))
  );

  RETURN jsonb_build_object('ok', true, 'card_id', p_card_id);
END;
$$;

-- ── admin__apply_set_patch ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin__apply_set_patch(
  p_set_code text,
  p_patch    jsonb
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;

  -- Keep the target present through the live update and serialize it with set
  -- deletion and other set patches.
  PERFORM 1 FROM sets WHERE set_code = p_set_code FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE sets SET
    set_name = CASE WHEN p_patch ? 'set_name'
      THEN p_patch->>'set_name' ELSE set_name END,
    set_uri = CASE WHEN p_patch ? 'set_uri'
      THEN NULLIF(p_patch->>'set_uri', '') ELSE set_uri END,
    set_search_uri = CASE WHEN p_patch ? 'set_search_uri'
      THEN NULLIF(p_patch->>'set_search_uri', '') ELSE set_search_uri END,
    published_on = CASE WHEN p_patch ? 'published_on' THEN (
      CASE WHEN NULLIF(p_patch->>'published_on', '') ~ '^\d{4}-\d{2}-\d{2}'
        THEN left(p_patch->>'published_on', 10)::date
        ELSE NULL
      END
    ) ELSE published_on END,
    is_promo = CASE WHEN p_patch ? 'is_promo'
      THEN coalesce((p_patch->>'is_promo')::boolean, false) ELSE is_promo END,
    parent_set_code = CASE WHEN p_patch ? 'parent_set_code'
      THEN NULLIF(p_patch->>'parent_set_code', '') ELSE parent_set_code END,
    external_ids = CASE WHEN p_patch ? 'external_ids'
      THEN coalesce(
        nullif(jsonb_merge_patch(external_ids, p_patch->'external_ids'), 'null'::jsonb),
        '{}'::jsonb
      )
      ELSE external_ids END
  WHERE set_code = p_set_code;

  RETURN true;
END;
$$;

-- ── admin_create_set ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_create_set(
  p_set_code   text,
  p_definition jsonb,
  p_actor      uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_name text;
BEGIN
  v_code := upper(NULLIF(btrim(p_set_code), ''));
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'set_code must not be empty';
  END IF;
  IF p_definition IS NULL
     OR jsonb_typeof(p_definition) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'definition must be a JSON object';
  END IF;

  v_name := NULLIF(btrim(p_definition->>'set_name'), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'definition requires set_name';
  END IF;
  IF EXISTS (SELECT 1 FROM set_deletions WHERE set_code = v_code) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_deleted');
  END IF;
  IF EXISTS (SELECT 1 FROM sets WHERE set_code = v_code)
     OR EXISTS (SELECT 1 FROM manual_sets WHERE set_code = v_code) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_exists');
  END IF;

  INSERT INTO manual_sets (set_code, definition, created_by)
  VALUES (v_code, p_definition, p_actor);

  INSERT INTO sets (set_code, set_name)
  VALUES (v_code, v_name);

  PERFORM admin__apply_set_patch(v_code, p_definition);
  PERFORM admin__log(p_actor, 'set.create', 'set', v_code, p_definition);

  RETURN jsonb_build_object('ok', true, 'set_code', v_code);
END;
$$;

-- ── admin_patch_set ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_patch_set(
  p_set_code text,
  p_patch    jsonb,
  p_note     text,
  p_actor    uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code  text;
  v_patch jsonb;
BEGIN
  v_code := upper(NULLIF(btrim(p_set_code), ''));
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'set_code must not be empty';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'patch must be a JSON object';
  END IF;

  IF NOT admin__apply_set_patch(v_code, p_patch) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_not_found');
  END IF;

  INSERT INTO set_overrides (set_code, patch, note, edited_by, updated_at)
  VALUES (v_code, p_patch, p_note, p_actor, now())
  ON CONFLICT (set_code) DO UPDATE SET
    patch      = jsonb_compose_merge_patch(set_overrides.patch, EXCLUDED.patch),
    note       = coalesce(EXCLUDED.note, set_overrides.note),
    edited_by  = EXCLUDED.edited_by,
    updated_at = now()
  RETURNING patch INTO v_patch;

  PERFORM admin__log(p_actor, 'set.patch', 'set', v_code, p_patch);

  RETURN jsonb_build_object(
    'ok', true,
    'set_code', v_code,
    'patch', v_patch
  );
END;
$$;

-- ── admin_delete_set ──────────────────────────────────────────────────────────
-- Refused while cards still reference the set: cards.set_id is ON DELETE SET
-- NULL, so an unguarded delete would silently orphan printings.
CREATE OR REPLACE FUNCTION admin_delete_set(
  p_set_code text,
  p_reason   text,
  p_actor    uuid
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_code       text;
  v_set_id     uuid;
  v_card_count integer;
BEGIN
  v_code := upper(NULLIF(btrim(p_set_code), ''));
  IF v_code IS NULL THEN
    RAISE EXCEPTION 'set_code must not be empty';
  END IF;

  -- Lock before checking children. This prevents a concurrent card move/create
  -- from adding a reference after the count but before the DELETE.
  SELECT id
  INTO v_set_id
  FROM sets
  WHERE set_code = v_code
  FOR UPDATE;
  IF v_set_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'set_not_found');
  END IF;

  SELECT count(*) INTO v_card_count FROM cards WHERE set_id = v_set_id;
  IF v_card_count > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'set_not_empty',
      'card_count', v_card_count
    );
  END IF;

  INSERT INTO set_deletions (set_code, deleted_by, reason)
  VALUES (v_code, p_actor, p_reason)
  ON CONFLICT (set_code) DO UPDATE SET
    deleted_by = EXCLUDED.deleted_by,
    reason     = coalesce(EXCLUDED.reason, set_deletions.reason);

  DELETE FROM sets WHERE id = v_set_id;
  PERFORM admin__log(
    p_actor,
    'set.delete',
    'set',
    v_code,
    jsonb_strip_nulls(jsonb_build_object('reason', p_reason))
  );

  RETURN jsonb_build_object('ok', true, 'set_code', v_code);
END;
$$;

-- Extend the Phase 2 publish RPC so completed admin uploads also update the
-- durable card override. Without this, the next ingest would reapply the
-- media_urls deletion tombstone used while variants are still pending.
CREATE OR REPLACE FUNCTION apply_card_hosted_media(
  p_card_id         text,
  p_source_hash     text,
  p_source_url      text,
  p_source_provider text,
  p_orientation     text,
  p_media_urls      jsonb
) RETURNS boolean
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_media_patch  jsonb;
  v_updated_rows integer;
BEGIN
  IF p_source_hash IS NULL OR p_source_hash = '' THEN
    RAISE EXCEPTION 'p_source_hash must not be empty';
  END IF;
  IF jsonb_typeof(p_media_urls) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'p_media_urls must be a JSON object';
  END IF;

  v_media_patch := jsonb_strip_nulls(
    jsonb_build_object(
      'source_hash', p_source_hash,
      'source_url', p_source_url,
      'source_provider', p_source_provider,
      'orientation', p_orientation,
      'media_urls', p_media_urls
    )
  );

  UPDATE cards
  SET media = coalesce(media, '{}'::jsonb) || v_media_patch
  WHERE id = p_card_id
    AND media->>'source_hash' = p_source_hash;

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 1 AND p_source_provider = 'admin' THEN
    UPDATE card_overrides
    SET patch = jsonb_compose_merge_patch(
          patch,
          jsonb_build_object('media', v_media_patch)
        ),
        updated_at = now()
    WHERE card_id = p_card_id
      AND patch #>> '{media,source_hash}' = p_source_hash;
  END IF;

  RETURN v_updated_rows = 1;
END;
$$;

-- ── Grants ────────────────────────────────────────────────────────────────────
-- Service role only. The API gates on ADMIN_USER_IDS before calling these; no
-- browser-facing role may reach them.
REVOKE ALL ON TABLE
  admin_audit_log,
  card_overrides,
  manual_cards,
  card_relationship_overrides,
  card_deletions,
  set_overrides,
  manual_sets,
  set_deletions
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE admin_audit_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE admin_audit_log_id_seq TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  card_overrides,
  manual_cards,
  card_relationship_overrides,
  card_deletions,
  set_overrides,
  manual_sets,
  set_deletions
TO service_role;

DO $$
DECLARE
  v_signature text;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'jsonb_merge_patch(jsonb, jsonb)',
    'jsonb_compose_merge_patch(jsonb, jsonb)',
    'admin__log(uuid, text, text, text, jsonb)',
    'admin__resolve_artist(text)',
    'admin__related_stub(text, text)',
    'admin__apply_card_patch(text, jsonb)',
    'admin__patch_card(text, jsonb, text, uuid, text)',
    'admin_patch_card(text, jsonb, text, uuid)',
    'admin_create_manual_card(text, jsonb, uuid)',
    'admin_delete_card(text, text, uuid)',
    'admin_restore_card(text, uuid)',
    'admin_set_card_slug(text, text, uuid)',
    'admin_move_card(text, text, uuid)',
    'admin_set_card_image(text, jsonb, uuid)',
    'admin_set_card_relationships(text, jsonb, uuid)',
    'admin__apply_set_patch(text, jsonb)',
    'admin_create_set(text, jsonb, uuid)',
    'admin_patch_set(text, jsonb, text, uuid)',
    'admin_delete_set(text, text, uuid)',
    'apply_card_hosted_media(text, text, text, text, text, jsonb)'
  ]
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_signature
    );
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END;
$$;
