-- ── preferred_printing_id is maintained by trigger ────────────────────────────
--
-- Reader: every oracle-slug URL. `/card/<oracle-slug>` carries no printing in
-- the path, so it renders the oracle's preferred printing; with none set the
-- API answers `Card has no printings` and the page 404s.
--
-- Writer: until now, only `ingest_catalogue` and `admin_restore_oracle` called
-- `refresh_preferred_printings`. Nothing in the admin *printing* path did, so a
-- manually created card — an oracle plus its first printing — was born with
-- `preferred_printing_id` NULL and was unreachable by its own slug until some
-- later ingest happened to fix it. A token added through /admin/cards/new 404s
-- while an ingested one beside it works.
--
-- A trigger rather than a call added to each admin RPC, because the set of
-- writers is larger than the obvious one and keeps growing: create, patch
-- (rarity and the four variant booleans are ranking inputs, and `set_code`
-- moves the printing to a set with a different date), soft delete, restore.
-- Naming them one by one is the "keep these in step" bug this schema keeps
-- paying for; deriving from the table means a future writer cannot forget.
--
-- The per-row cost that made `refresh_ruling_rule_matches` deliberately *not* a
-- trigger does not apply, because this one honours the same
-- `riftseer.defer_projection` guard `resolved_printings_sync` uses: ingest
-- rewrites thousands of rows with the flag on and calls
-- `refresh_preferred_printings(NULL)` once at the end, so the trigger costs
-- nothing there and fires only on the one-at-a-time admin writes it exists for.
--
-- Adds no column.

CREATE OR REPLACE FUNCTION preferred_printing_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF projection_deferred() THEN
    RETURN NULL;
  END IF;

  -- An UPDATE that moves a printing between oracles leaves both needing a
  -- re-rank, so both ids go in; refresh_preferred_printings ignores NULLs it
  -- is not given and skips any oracle with preferred_printing_locked.
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_preferred_printings(ARRAY[OLD.oracle_id]);
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM refresh_preferred_printings(ARRAY[NEW.oracle_id]);
  ELSE
    PERFORM refresh_preferred_printings(
      ARRAY(SELECT DISTINCT unnest(ARRAY[OLD.oracle_id, NEW.oracle_id])));
  END IF;

  RETURN NULL;
END;
$$;

-- Statement-level would need transition tables for the same information and
-- admin writes are one row at a time, so row-level is both simpler and no
-- costlier here. Ranking inputs only: an image, a rarity, the variant flags,
-- the set, the collector number that breaks ties within one set, and whether
-- the row is live.
DROP TRIGGER IF EXISTS printings_preferred_sync ON printings;
CREATE TRIGGER printings_preferred_sync
  AFTER INSERT OR DELETE OR UPDATE OF
    oracle_id, set_id, deleted_at, rarity, image_hosted_at, collector_number,
    is_signature, is_alternate_art, is_overnumbered, is_special_collection
  ON printings
  FOR EACH ROW EXECUTE FUNCTION preferred_printing_sync();

REVOKE ALL ON FUNCTION preferred_printing_sync() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION preferred_printing_sync() TO service_role;

-- Backfill. Clear any pointer aimed at a row that is no longer live, then let
-- the refresh choose for every oracle that has live printings and no pick —
-- which is the reported case, and which a rebuilt database would not reproduce
-- because ingest sets the pointer on the way in.
UPDATE oracles o SET preferred_printing_id = NULL
WHERE o.preferred_printing_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM printings p
    WHERE p.id = o.preferred_printing_id AND p.deleted_at IS NULL);

SELECT refresh_preferred_printings(NULL);
