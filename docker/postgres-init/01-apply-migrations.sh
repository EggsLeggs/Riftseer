#!/bin/bash
# Build the schema in two databases from the same migrations.
#
#   riftseer       the dev catalogue — what `dev:api:local` and
#                  `dev:ingest:local` read and write, and what a real local
#                  ingest fills with ~1300 printings.
#   riftseer_test  a throwaway for the database contract tests, which RESEED
#                  to a small fixture. Pointing those at the dev database
#                  would silently delete a catalogue that takes a minute to
#                  rebuild, so they get their own.
#
# Loops the mounted directory rather than mounting one file, so a migration
# added after the baseline is picked up with no compose change. Runs only on
# first initialisation of an empty data volume; `db:local:reset` drops it.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -q -c "CREATE DATABASE riftseer_test"

for database in "$POSTGRES_DB" riftseer_test; do
  echo "==> $database"

  # `auth` is a schema, so unlike the roles it has to exist in each database
  # the migrations are applied to — `profiles` references auth.users.
  #
  # The default privileges mirror what a real Supabase project already has, and
  # matter more than they look. The baseline grants the card tables to
  # service_role explicitly, but says nothing about `profiles`, `follows` or
  # `linked_accounts` — in production those inherit Supabase's defaults, and
  # here they inherited nothing, so reading a profile failed with `permission
  # denied` (42501). The users route reads that as a schema mismatch rather
  # than a missing row and answers 503, which surfaces as "Profile
  # unavailable". Setting the defaults before the migrations run fixes every
  # future table too, instead of this one symptom.
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$database" -q <<'SQL'
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
SQL

  for migration in /migrations/*.sql; do
    echo "    applying $(basename "$migration")"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$database" \
      -q -f "$migration"
  done
done

echo "==> schema ready in $POSTGRES_DB and riftseer_test"
