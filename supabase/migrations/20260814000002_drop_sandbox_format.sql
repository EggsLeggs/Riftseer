-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  Drop the seeded `sandbox` format                                       │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Reader: `GET /formats` (the public format list, now carrying zone rules so a
-- signed-out builder can validate in the browser), `GET /admin/formats`, and
-- every format picker in packages/web.
--
-- Writer: nobody. This migration deletes seed data and adds no writer.
--
-- Why: `20260814000000_deck_model.sql` seeded `sandbox` as a format with no
-- `format_zone_rules` rows — a *format* that enforces nothing. That was a
-- misreading of what was asked for. "Sandbox" meant *building a deck without an
-- account*: use the editor, export the text, and optionally sign in to save.
-- That is a session concern, handled in the browser against localStorage, and
-- it has nothing to say about which rules a deck is judged by — a guest builds
-- in `standard` like everybody else. A rules-free format left in the picker is
-- an invitation to file decks under a format that can never be wrong, which is
-- not a thing this catalogue wants to publish.
--
-- Adds no column.

-- `decks.format_id` is ON DELETE RESTRICT, so an unguarded DELETE would abort
-- the whole migration on any database where somebody actually built a sandbox
-- deck — including, one day, production. The guard is deliberate and the
-- outcome is deliberate too: where the format is in use it *stays*, marked
-- inactive so it disappears from every public list and picker while the decks
-- pointing at it keep resolving their format name. Nothing here is destructive
-- to a user's deck.
--
-- The child rows cascade from `formats`, but they are deleted explicitly: the
-- intent is "this format and everything that described it", and an explicit
-- statement says so at the one moment somebody is reading this file to find out
-- what happened to their rules.

DO $$
DECLARE
  v_format_id uuid;
  v_decks     bigint;
BEGIN
  SELECT id INTO v_format_id FROM formats WHERE code = 'sandbox';
  IF v_format_id IS NULL THEN
    RAISE NOTICE 'sandbox format not present; nothing to drop';
    RETURN;
  END IF;

  -- Both referencing tables, not just `decks`. `deck_revisions.format_id` is
  -- ON DELETE RESTRICT too, and a revision keeps the format it was made in — so
  -- a deck moved off `sandbox` leaves sandbox revisions behind after `decks` has
  -- stopped pointing at it. Counting only `decks` would read 0 there, run the
  -- DELETE, and let the revision foreign key abort the migration: exactly the
  -- failure this guard exists to prevent.
  SELECT (SELECT count(*) FROM decks           WHERE format_id = v_format_id)
       + (SELECT count(*) FROM deck_revisions  WHERE format_id = v_format_id)
    INTO v_decks;
  IF v_decks > 0 THEN
    UPDATE formats SET active = false WHERE id = v_format_id;
    RAISE NOTICE
      'sandbox format retained and deactivated: % deck/revision row(s) still reference it',
      v_decks;
    RETURN;
  END IF;

  DELETE FROM format_zone_rules          WHERE format_id = v_format_id;
  DELETE FROM format_legality_severities WHERE format_id = v_format_id;
  DELETE FROM formats                    WHERE id = v_format_id;
  RAISE NOTICE 'sandbox format dropped';
END
$$;
