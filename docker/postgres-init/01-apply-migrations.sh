#!/bin/bash
# Apply every migration in filename order, the same order supabase db push uses.
#
# Loops the mounted directory rather than mounting one file, so a migration
# added after the baseline is picked up with no compose change. Runs only on
# first initialisation of an empty data volume; to re-apply, drop the volume.
set -euo pipefail

for migration in /migrations/*.sql; do
  echo "==> applying $(basename "$migration")"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -q -f "$migration"
done

echo "==> schema ready"
