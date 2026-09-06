-- Cluster-wide Supabase roles.
--
-- Roles live in the cluster, not in a database, so they are created once here.
-- The per-database `auth` objects are created by 01-apply-migrations.sh, which
-- has to do it for every database it builds.
--
-- These are stubs: enough for the schema to build and for PostgREST to assume
-- `service_role`, not a working auth system. Local development uses the
-- service role throughout, exactly as the Workers do in production.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT service_role TO postgres;
