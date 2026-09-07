-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  Restore parked user rows into the baseline's tables                    │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- The other half of 20260809999999: the teardown parked `profiles`, `follows`
-- and `linked_accounts` in `legacy_hold` while the baseline rebuilt `public`.
-- This copies every row back and drops the holding schema.
--
-- Column lists are the intersection of the parked table and the baseline
-- table, computed at run time: a column both sides share is copied, a column
-- only the baseline has takes its default. If the baseline ever gains a NOT
-- NULL column without a default this fails loudly inside the transaction
-- rather than inventing data.
--
-- No `legacy_hold` schema — every database except pre-baseline production —
-- means this file no-ops.

DO $$
DECLARE
  tbl  text;
  cols text;
BEGIN
  IF to_regclass('legacy_hold.profiles') IS NULL THEN
    RETURN;
  END IF;

  -- Only drop a hold this transition created. A pre-existing legacy_hold with
  -- a profiles table is not ours to CASCADE away.
  IF to_regclass('legacy_hold._pre_baseline_transition') IS NULL THEN
    RAISE EXCEPTION
      'legacy_hold exists without the pre-baseline transition marker; refusing to restore or drop';
  END IF;

  -- profiles first: follows and linked_accounts reference it.
  FOREACH tbl IN ARRAY ARRAY['profiles', 'follows', 'linked_accounts'] LOOP
    IF to_regclass(format('legacy_hold.%I', tbl)) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(held.column_name), ', ' ORDER BY held.ordinal_position)
      INTO cols
      FROM information_schema.columns held
      JOIN information_schema.columns fresh
        ON fresh.table_schema = 'public'
       AND fresh.table_name   = tbl
       AND fresh.column_name  = held.column_name
     WHERE held.table_schema = 'legacy_hold'
       AND held.table_name   = tbl;

    IF cols IS NOT NULL THEN
      EXECUTE format(
        'INSERT INTO public.%I (%s) SELECT %s FROM legacy_hold.%I',
        tbl, cols, cols, tbl
      );
    END IF;
  END LOOP;

  DROP SCHEMA legacy_hold CASCADE;
END $$;
