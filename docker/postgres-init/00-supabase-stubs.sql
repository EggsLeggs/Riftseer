-- Supabase-only objects the migrations depend on.
--
-- A stock Postgres image has no `auth` schema and none of the Supabase roles,
-- so the baseline cannot apply without these. They are stubs: enough for the
-- schema to build and for PostgREST to assume `service_role`, not a working
-- auth system. Local development uses the service role for everything, exactly
-- as the Workers do in production.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT service_role TO postgres;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE auth.users (id uuid PRIMARY KEY);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULL::uuid $$;
