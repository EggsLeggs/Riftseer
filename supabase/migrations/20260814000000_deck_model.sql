-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  Deck model — decks, zones, collaborators, revisions, format rules      │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Reader: the deck builder (`/decks`, `/decks/<id>`), the deck legality panel,
-- and `/admin/formats`. A deck page renders its zones from `deck_cards`, its
-- validity from `format_zone_rules` + the legality tables, and its history
-- from `deck_revisions`.
--
-- Writer: the deck routes in packages/api (`deck_apply_card_changes` for card
-- edits, plain upserts for deck metadata and collaborators) and the admin
-- format routes for the two new catalogue tables.
--
-- Adds columns: `oracle_legalities.note` and `printing_legalities.note`, plus a
-- `(id, oracle_id)` unique on `printings` — which exists only so `deck_cards`
-- can carry a composite foreign key. Everything else is new tables.
--
-- Why a composite FK rather than two independent ones: a deck row names both a
-- printing and its oracle, because the builder counts copies per *oracle* (the
-- three-of rule is a rules-object rule) while it renders the *printing* the
-- user picked. Two separate FKs would let those two columns disagree; the
-- composite key makes "this printing belongs to this oracle" a schema fact
-- instead of a rule documented somewhere and enforced nowhere.

-- ── printings gains the composite key deck_cards points at ────────────────────
--
-- Redundant as a uniqueness claim — `id` is already the primary key — and
-- required as a *referenceable* key: Postgres will only accept a composite FK
-- whose target columns carry a unique constraint.

ALTER TABLE printings ADD CONSTRAINT printings_id_oracle_key UNIQUE (id, oracle_id);

-- ── legality gains `restricted` and a note ────────────────────────────────────
--
-- `restricted` is a fourth status rather than a boolean beside `banned`,
-- because the builder asks one question of a card — what is its status in this
-- format — and a status enum answers it in one read. `note` carries the human
-- sentence the builder shows in the tooltip ("restricted to 1 copy as of the
-- 2026-07 update"), which previously had nowhere to live and ended up in
-- ruling text that applied to every format at once.
--
-- Reader: the builder's per-card legality tooltip.
-- Writer: /admin/formats and the card legalities panel.
--
-- Default-legal is unchanged: absence still means legal, and precedence is
-- still printing row → oracle row → legal.

-- Guarded so a partially applied database can be re-run: an unguarded DROP or
-- ADD aborts the whole migration on a database where either half already landed.
ALTER TABLE oracle_legalities DROP CONSTRAINT IF EXISTS oracle_legalities_status_check;
ALTER TABLE oracle_legalities ADD CONSTRAINT oracle_legalities_status_check
  CHECK (status IN ('legal', 'restricted', 'not_legal', 'banned'));
ALTER TABLE oracle_legalities ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE printing_legalities DROP CONSTRAINT IF EXISTS printing_legalities_status_check;
ALTER TABLE printing_legalities ADD CONSTRAINT printing_legalities_status_check
  CHECK (status IN ('legal', 'restricted', 'not_legal', 'banned'));
ALTER TABLE printing_legalities ADD COLUMN IF NOT EXISTS note text;

-- ── format rules ──────────────────────────────────────────────────────────────
--
-- What a format demands of each zone. NULL means unconstrained, and a format
-- with no rows at all constrains nothing — which is the whole of how the
-- sandbox format works. No `is_sandbox` boolean, because "sandbox" is not a
-- kind of format, it is a format that happens to have no rules; a boolean
-- would be a second source of truth for the same question the rows already
-- answer.

CREATE TABLE format_zone_rules (
  format_id  uuid    NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  zone       text    NOT NULL CHECK (zone IN
               ('legend', 'main', 'sideboard', 'runes', 'battlefields', 'considering')),
  min_count  integer,
  max_count  integer,
  copy_limit integer,
  PRIMARY KEY (format_id, zone),
  CONSTRAINT format_zone_rules_range
    CHECK (min_count IS NULL OR max_count IS NULL OR min_count <= max_count)
);

ALTER TABLE format_zone_rules ENABLE ROW LEVEL SECURITY;

-- How loudly the builder complains about each legality status. Rows here
-- OVERRIDE a default mapping that lives in TypeScript (@riftseer/types), and an
-- absent row falls through to that default — so a format only stores the
-- severities where it disagrees, and adding a status does not require
-- backfilling every format.
CREATE TABLE format_legality_severities (
  format_id uuid NOT NULL REFERENCES formats(id) ON DELETE CASCADE,
  status    text NOT NULL CHECK (status IN ('legal', 'restricted', 'not_legal', 'banned')),
  severity  text NOT NULL CHECK (severity IN ('none', 'warning', 'error')),
  PRIMARY KEY (format_id, status)
);

ALTER TABLE format_legality_severities ENABLE ROW LEVEL SECURITY;

-- ── decks ─────────────────────────────────────────────────────────────────────

CREATE TABLE decks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  format_id   uuid NOT NULL REFERENCES formats(id) ON DELETE RESTRICT,
  name        text NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 120),
  description text CHECK (description IS NULL OR char_length(description) <= 500),
  primer      text,
  visibility  text NOT NULL DEFAULT 'private'
              CHECK (visibility IN ('private', 'unlisted', 'public')),
  invite_code text UNIQUE,
  invite_role text CHECK (invite_role IN ('editor', 'viewer')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invite_role_with_code CHECK ((invite_code IS NULL) = (invite_role IS NULL))
);

CREATE INDEX decks_owner_idx ON decks (owner_id);
-- The /decks browse page: most recently updated public decks first.
CREATE INDEX decks_browse_idx ON decks (visibility, updated_at DESC);

CREATE TRIGGER decks_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE decks ENABLE ROW LEVEL SECURITY;

CREATE TABLE deck_cards (
  deck_id     uuid    NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  zone        text    NOT NULL CHECK (zone IN
                ('legend', 'main', 'sideboard', 'runes', 'battlefields', 'considering')),
  printing_id text    NOT NULL,
  oracle_id   uuid    NOT NULL,
  quantity    integer NOT NULL CHECK (quantity > 0),
  -- A flag on a `main` row, not a zone of its own. You may run three copies of
  -- a champion and still nominate only one of them as *the* champion, so
  -- champion-ness is a property of one row in the main deck rather than a
  -- separate pile the card would have to be moved into and back out of.
  is_champion boolean NOT NULL DEFAULT false,
  PRIMARY KEY (deck_id, zone, printing_id),
  FOREIGN KEY (printing_id, oracle_id) REFERENCES printings (id, oracle_id) ON DELETE RESTRICT,
  CONSTRAINT champion_is_main CHECK (NOT is_champion OR zone = 'main'),
  CONSTRAINT legend_single    CHECK (zone <> 'legend' OR quantity = 1)
);

CREATE UNIQUE INDEX deck_cards_one_champion ON deck_cards (deck_id) WHERE is_champion;
CREATE UNIQUE INDEX deck_cards_one_legend   ON deck_cards (deck_id) WHERE zone = 'legend';

ALTER TABLE deck_cards ENABLE ROW LEVEL SECURITY;

-- Which printing of a token this deck shows. One per oracle: a token is a
-- rules object the deck references, and the choice is purely cosmetic.
CREATE TABLE deck_token_printings (
  deck_id     uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  oracle_id   uuid NOT NULL REFERENCES oracles(id) ON DELETE CASCADE,
  printing_id text NOT NULL,
  PRIMARY KEY (deck_id, oracle_id),
  FOREIGN KEY (printing_id, oracle_id) REFERENCES printings (id, oracle_id) ON DELETE CASCADE
);

ALTER TABLE deck_token_printings ENABLE ROW LEVEL SECURITY;

CREATE TABLE deck_collaborators (
  deck_id    uuid NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('editor', 'viewer')),
  added_via  text NOT NULL CHECK (added_via IN ('invite', 'link')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (deck_id, user_id)
);

-- "Decks shared with me".
CREATE INDEX deck_collaborators_user_idx ON deck_collaborators (user_id);

ALTER TABLE deck_collaborators ENABLE ROW LEVEL SECURITY;

-- ── revisions ─────────────────────────────────────────────────────────────────
--
-- A revision is a coalesced burst of edits, not one edit. `format_id` is
-- copied onto the row because a deck can be moved between formats and the
-- history has to stay readable in the terms it was made in.

CREATE TABLE deck_revisions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id    uuid    NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  ordinal    integer NOT NULL,
  author_id  uuid REFERENCES profiles(id) ON DELETE SET NULL,
  format_id  uuid NOT NULL REFERENCES formats(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deck_id, ordinal)
);

ALTER TABLE deck_revisions ENABLE ROW LEVEL SECURITY;

CREATE TABLE deck_revision_changes (
  revision_id uuid    NOT NULL REFERENCES deck_revisions(id) ON DELETE CASCADE,
  zone        text    NOT NULL,
  oracle_id   uuid    NOT NULL REFERENCES oracles(id) ON DELETE CASCADE,
  printing_id text    NOT NULL,
  qty_before  integer NOT NULL,
  qty_after   integer NOT NULL,
  PRIMARY KEY (revision_id, zone, printing_id),
  CHECK (qty_before <> qty_after)
);

ALTER TABLE deck_revision_changes ENABLE ROW LEVEL SECURITY;

-- ── seed formats ──────────────────────────────────────────────────────────────
--
-- `formats` shipped empty — only `admin_create_format` ever inserted — and
-- `decks.format_id` is NOT NULL, so with no rows here no deck could be created
-- at all. Idempotent so a database that already has these keeps its ids.

INSERT INTO formats (code, name, sort_order)
VALUES ('standard', 'Standard', 0),
       ('sandbox',  'Sandbox', 100)
ON CONFLICT (code) DO NOTHING;

-- Selected by code rather than by a captured id, so this runs identically on a
-- fresh database and on one where `standard` already existed.
INSERT INTO format_zone_rules (format_id, zone, min_count, max_count, copy_limit)
SELECT f.id, r.zone, r.min_count, r.max_count, r.copy_limit
FROM formats f
CROSS JOIN (VALUES
  ('legend',       1::integer,    1::integer,  NULL::integer),
  ('main',         40,            40,          3),
  ('sideboard',    NULL::integer, 10,          3),
  ('runes',        12,            12,          NULL::integer),
  ('battlefields', 3,             3,           1)
) AS r(zone, min_count, max_count, copy_limit)
WHERE f.code = 'standard'
ON CONFLICT (format_id, zone) DO NOTHING;

-- `sandbox` deliberately gets no format_zone_rules rows. That absence *is* the
-- format.

-- ── deck_apply_card_changes ───────────────────────────────────────────────────
--
-- One transaction that applies a batch of card edits and folds them into the
-- deck's revision history. The builder sends whole batches (a drag that moves
-- four cards is one call), so the history records intent rather than
-- keystrokes.
--
-- p_changes is a JSON array of
--   { zone, printing_id, oracle_id, quantity, is_champion }
-- where `quantity = 0` means remove the row.
--
-- Not an admin action: no admin__log call, and the envelope is the same
-- { ok, reason } shape the admin RPCs use only because that is this schema's
-- convention for "a failure the caller should render, not an exception".

CREATE OR REPLACE FUNCTION deck_apply_card_changes(
  p_deck_id uuid,
  p_author  uuid,
  p_changes jsonb
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_format_id   uuid;
  v_rev         uuid;
  v_change      jsonb;
  v_zone        text;
  v_printing_id text;
  v_oracle_id   uuid;
  v_quantity    integer;
  v_champion    boolean;
  v_before      integer;
  v_start       integer;
  v_rev_before  integer;
  v_row_oracle  uuid;
  v_remaining   integer;
BEGIN
  SELECT format_id INTO v_format_id FROM decks WHERE id = p_deck_id;
  IF v_format_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deck_not_found');
  END IF;

  IF p_changes IS NULL OR jsonb_typeof(p_changes) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_changes');
  END IF;

  -- Finding the open revision and allocating a new ordinal is a read-then-write,
  -- and concurrent collaborators are a supported case. Two sessions arriving
  -- together would both compute `max(ordinal) + 1` as the same number, and the
  -- second insert would raise a unique violation on
  -- `deck_revisions (deck_id, ordinal)` — an exception, rather than the
  -- `{ ok, reason }` envelope every route here renders. The lock is per deck and
  -- held to commit, so it serialises this one deck's edits and nothing else.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_deck_id::text, 0));

  -- The open revision. Five minutes is a deliberate, confirmed choice: long
  -- enough that a single sitting of tuning a curve reads as one entry in the
  -- history, short enough that coming back after lunch starts a new one. It is
  -- scoped to the author as well as the deck, so two collaborators editing at
  -- once never share a revision and neither of them loses their attribution.
  SELECT id INTO v_rev
  FROM deck_revisions
  WHERE deck_id = p_deck_id
    AND author_id = p_author
    AND created_at > now() - interval '5 minutes'
  ORDER BY ordinal DESC
  LIMIT 1;

  IF v_rev IS NULL THEN
    INSERT INTO deck_revisions (deck_id, ordinal, author_id, format_id)
    SELECT p_deck_id, coalesce(max(ordinal), 0) + 1, p_author, v_format_id
    FROM deck_revisions
    WHERE deck_id = p_deck_id
    RETURNING id INTO v_rev;
  END IF;

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes) LOOP
    v_zone        := v_change ->> 'zone';
    v_printing_id := v_change ->> 'printing_id';
    v_quantity    := coalesce((v_change ->> 'quantity')::integer, 0);
    v_champion    := coalesce((v_change ->> 'is_champion')::boolean, false);

    IF v_zone IS NULL OR v_zone NOT IN
       ('legend', 'main', 'sideboard', 'runes', 'battlefields', 'considering') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_zone');
    END IF;
    IF v_printing_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'missing_printing_id');
    END IF;

    SELECT quantity, oracle_id INTO v_before, v_row_oracle
    FROM deck_cards
    WHERE deck_id = p_deck_id AND zone = v_zone AND printing_id = v_printing_id;

    -- A removal need not restate the oracle; the row already knows it.
    v_oracle_id := coalesce(nullif(v_change ->> 'oracle_id', '')::uuid, v_row_oracle);
    v_before    := coalesce(v_before, 0);

    IF v_oracle_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'missing_oracle_id');
    END IF;

    IF v_quantity <= 0 THEN
      v_quantity := 0;
      DELETE FROM deck_cards
      WHERE deck_id = p_deck_id AND zone = v_zone AND printing_id = v_printing_id;
    ELSE
      -- Clear the outgoing champion first, or the partial unique index trips
      -- mid-statement on what is really a hand-off between two rows.
      IF v_champion THEN
        UPDATE deck_cards SET is_champion = false
        WHERE deck_id = p_deck_id
          AND is_champion
          AND NOT (zone = v_zone AND printing_id = v_printing_id);
      END IF;

      INSERT INTO deck_cards (deck_id, zone, printing_id, oracle_id, quantity, is_champion)
      VALUES (p_deck_id, v_zone, v_printing_id, v_oracle_id, v_quantity, v_champion)
      ON CONFLICT (deck_id, zone, printing_id)
      DO UPDATE SET oracle_id   = excluded.oracle_id,
                    quantity    = excluded.quantity,
                    is_champion = excluded.is_champion;
    END IF;

    -- Merge into the open revision. The burst's *starting* quantity is the one
    -- that survives, so an entry always reads from where the deck actually
    -- stood when the burst opened rather than from the last keystroke; only
    -- qty_after moves.
    SELECT qty_before INTO v_rev_before
    FROM deck_revision_changes
    WHERE revision_id = v_rev AND zone = v_zone AND printing_id = v_printing_id;

    v_start := coalesce(v_rev_before, v_before);

    IF v_start = v_quantity THEN
      -- Adding a card and taking it straight back out is not a change. This is
      -- resolved before the write, not cleaned up after it, because
      -- CHECK (qty_before <> qty_after) means the no-op row cannot exist even
      -- momentarily.
      DELETE FROM deck_revision_changes
      WHERE revision_id = v_rev AND zone = v_zone AND printing_id = v_printing_id;
    ELSE
      INSERT INTO deck_revision_changes
        (revision_id, zone, oracle_id, printing_id, qty_before, qty_after)
      VALUES (v_rev, v_zone, v_oracle_id, v_printing_id, v_start, v_quantity)
      ON CONFLICT (revision_id, zone, printing_id)
      DO UPDATE SET qty_after = excluded.qty_after,
                    oracle_id = excluded.oracle_id;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_remaining
  FROM deck_revision_changes WHERE revision_id = v_rev;

  IF v_remaining = 0 THEN
    DELETE FROM deck_revisions WHERE id = v_rev;
    RETURN jsonb_build_object('ok', true, 'revision_id', NULL);
  END IF;

  -- `decks_updated_at` fires on UPDATE decks, and this function writes only
  -- deck_cards and the revision tables. Without this the timestamp would still
  -- read from the last metadata patch, and `decks_browse_idx` — "most recently
  -- updated public decks first" — would rank an actively edited deck as stale.
  UPDATE decks SET updated_at = now() WHERE id = p_deck_id;

  RETURN jsonb_build_object('ok', true, 'revision_id', v_rev);
END;
$$;

-- ── row level security ────────────────────────────────────────────────────────
--
-- The API is the real authorisation boundary: the Worker holds a service-role
-- key and bypasses RLS entirely, so every rule that actually decides who may
-- read or edit a deck lives in packages/api. These policies are defence in
-- depth — they are what stands between a leaked anon key and the whole deck
-- table, and nothing more.
--
-- The two helpers are SECURITY DEFINER on purpose. A `decks` policy that reads
-- `deck_collaborators` and a `deck_collaborators` policy that reads `decks`
-- would be mutually recursive and Postgres raises rather than resolving it;
-- running the lookup as the table owner breaks the cycle.

CREATE OR REPLACE FUNCTION deck_role_for(p_deck_id uuid, p_user uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_user IS NULL THEN NULL
    WHEN EXISTS (SELECT 1 FROM decks d WHERE d.id = p_deck_id AND d.owner_id = p_user)
      THEN 'owner'
    ELSE (SELECT c.role FROM deck_collaborators c
          WHERE c.deck_id = p_deck_id AND c.user_id = p_user)
  END;
$$;

CREATE OR REPLACE FUNCTION deck_is_readable(p_deck_id uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM decks d WHERE d.id = p_deck_id AND d.visibility = 'public'
  ) OR deck_role_for(p_deck_id, p_user) IS NOT NULL;
$$;

CREATE POLICY decks_public_read ON decks FOR SELECT
  USING (visibility = 'public' OR deck_role_for(id, auth.uid()) IS NOT NULL);
CREATE POLICY decks_owner_all ON decks FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE POLICY decks_editor_update ON decks FOR UPDATE
  USING (deck_role_for(id, auth.uid()) = 'editor')
  WITH CHECK (deck_role_for(id, auth.uid()) = 'editor');

CREATE POLICY deck_cards_read ON deck_cards FOR SELECT
  USING (deck_is_readable(deck_id, auth.uid()));
CREATE POLICY deck_cards_write ON deck_cards FOR ALL
  USING (deck_role_for(deck_id, auth.uid()) IN ('owner', 'editor'))
  WITH CHECK (deck_role_for(deck_id, auth.uid()) IN ('owner', 'editor'));

CREATE POLICY deck_token_printings_read ON deck_token_printings FOR SELECT
  USING (deck_is_readable(deck_id, auth.uid()));
CREATE POLICY deck_token_printings_write ON deck_token_printings FOR ALL
  USING (deck_role_for(deck_id, auth.uid()) IN ('owner', 'editor'))
  WITH CHECK (deck_role_for(deck_id, auth.uid()) IN ('owner', 'editor'));

-- A collaborator may always see their own membership — that is the "decks
-- shared with me" list — but only the owner manages the roster.
CREATE POLICY deck_collaborators_self_read ON deck_collaborators FOR SELECT
  USING (user_id = auth.uid());
CREATE POLICY deck_collaborators_owner_all ON deck_collaborators FOR ALL
  USING (deck_role_for(deck_id, auth.uid()) = 'owner')
  WITH CHECK (deck_role_for(deck_id, auth.uid()) = 'owner');

CREATE POLICY deck_revisions_read ON deck_revisions FOR SELECT
  USING (deck_is_readable(deck_id, auth.uid()));
CREATE POLICY deck_revisions_write ON deck_revisions FOR ALL
  USING (deck_role_for(deck_id, auth.uid()) IN ('owner', 'editor'))
  WITH CHECK (deck_role_for(deck_id, auth.uid()) IN ('owner', 'editor'));

-- Reached through its revision. No cycle: deck_revisions' own policies resolve
-- against decks through the SECURITY DEFINER helpers.
CREATE POLICY deck_revision_changes_read ON deck_revision_changes FOR SELECT
  USING (EXISTS (SELECT 1 FROM deck_revisions r WHERE r.id = revision_id));
CREATE POLICY deck_revision_changes_write ON deck_revision_changes FOR ALL
  USING (EXISTS (SELECT 1 FROM deck_revisions r
                 WHERE r.id = revision_id
                   AND deck_role_for(r.deck_id, auth.uid()) IN ('owner', 'editor')))
  WITH CHECK (EXISTS (SELECT 1 FROM deck_revisions r
                      WHERE r.id = revision_id
                        AND deck_role_for(r.deck_id, auth.uid()) IN ('owner', 'editor')));

-- format_zone_rules and format_legality_severities get no policies at all: they
-- are catalogue tables like sets and formats, service-role only, and RLS
-- enabled with zero policies means anon and authenticated see no rows.

-- ── grants ────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'format_zone_rules', 'format_legality_severities',
    'decks', 'deck_cards', 'deck_token_printings', 'deck_collaborators',
    'deck_revisions', 'deck_revision_changes'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', v_table);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', v_table);
  END LOOP;
END
$$;

REVOKE ALL ON FUNCTION deck_apply_card_changes(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION deck_apply_card_changes(uuid, uuid, jsonb) TO service_role;

-- The policy helpers are the exception to the revoke-everything rule: a policy
-- expression is evaluated as the querying role, so a role with no EXECUTE here
-- gets an error instead of an empty result. They are SECURITY DEFINER but read
-- only, take the user as a parameter, and return a role name or a boolean.
REVOKE ALL ON FUNCTION deck_role_for(uuid, uuid)    FROM PUBLIC;
REVOKE ALL ON FUNCTION deck_is_readable(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deck_role_for(uuid, uuid)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION deck_is_readable(uuid, uuid) TO anon, authenticated, service_role;
