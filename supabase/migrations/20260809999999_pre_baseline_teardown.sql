-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  Pre-baseline teardown — the recorded legacy → baseline transition      │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- The 20260810000000 baseline is a fresh-database script: plain CREATE TABLE,
-- no drops. A database that predates it (production) still carries the legacy
-- card schema, so the baseline would collide on `sets` and `profiles` and
-- abort. This file clears the way, exactly once, on exactly that database.
--
-- Detection is the legacy `cards` table. A fresh database, and every database
-- already past the baseline, does not have it, so this whole file no-ops —
-- which is what lets it sit in the append-only chain and replay safely
-- everywhere.
--
-- User data is not card data. `profiles`, `follows` and `linked_accounts` are
-- parked in a `legacy_hold` schema here and copied back into the baseline's
-- tables by 20260811000000. Everything else in `public` is card-domain state
-- that the next ingest run rebuilds from source.

DO $$
DECLARE
  r record;
BEGIN
  IF to_regclass('public.cards') IS NULL THEN
    RETURN;
  END IF;

  -- Refuse to park into a pre-existing schema: it may hold unrelated objects,
  -- and the restore migration would CASCADE-drop them. The marker table is the
  -- ownership proof 20260811000000 checks before dropping.
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'legacy_hold') THEN
    RAISE EXCEPTION
      'legacy_hold schema already exists; refusing pre-baseline teardown';
  END IF;
  CREATE SCHEMA legacy_hold;
  CREATE TABLE legacy_hold._pre_baseline_transition (
    owned_by text NOT NULL DEFAULT '20260809999999_pre_baseline_teardown'
  );

  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE public.profiles SET SCHEMA legacy_hold;
  END IF;
  IF to_regclass('public.follows') IS NOT NULL THEN
    ALTER TABLE public.follows SET SCHEMA legacy_hold;
  END IF;
  IF to_regclass('public.linked_accounts') IS NOT NULL THEN
    ALTER TABLE public.linked_accounts SET SCHEMA legacy_hold;
  END IF;

  -- Objects owned by extensions are excluded: dropping them would corrupt the
  -- extension, and the baseline does not recreate extensions.
  FOR r IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid AND d.deptype = 'e'
      )
  LOOP
    IF r.relkind = 'v' THEN
      EXECUTE format('DROP VIEW IF EXISTS public.%I CASCADE', r.relname);
    ELSIF r.relkind = 'm' THEN
      EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS public.%I CASCADE', r.relname);
    ELSE
      EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE', r.relname);
    END IF;
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('DROP ROUTINE IF EXISTS %s CASCADE', r.signature);
  END LOOP;

  FOR r IN
    SELECT c.relname AS sequencename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('DROP SEQUENCE IF EXISTS public.%I CASCADE', r.sequencename);
  END LOOP;

  FOR r IN
    SELECT t.typname
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typtype IN ('e', 'c', 'd')
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c WHERE c.reltype = t.oid
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.objid = t.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
  END LOOP;
END $$;
