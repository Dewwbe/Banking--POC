#!/usr/bin/env bash
# Workstream F — restore a backup produced by backup.sh.
# Usage: ./scripts/restore.sh backups/20261019T080000Z
# Record in the report: restore duration, whether admin users / roles / API tokens / media survived.
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
DIR=${1:?Usage: restore.sh backups/<timestamp>}
( cd "$DIR" && sha256sum -c SHA256SUMS )

START=$(date +%s)
echo "[restore] Stopping CMS and web …"
docker compose stop cms web

echo "[restore] Recreating database …"
docker compose exec -T db psql -U "$DATABASE_USERNAME" -d postgres -c "DROP DATABASE IF EXISTS \"$DATABASE_NAME\" WITH (FORCE);"
docker compose exec -T db psql -U "$DATABASE_USERNAME" -d postgres -c "CREATE DATABASE \"$DATABASE_NAME\" OWNER \"$DATABASE_USERNAME\";"
docker compose exec -T db pg_restore -U "$DATABASE_USERNAME" -d "$DATABASE_NAME" --no-owner < "$DIR/db.dump"

echo "[restore] Restoring media …"
docker compose run --rm --no-deps -T --entrypoint sh cms -c "rm -rf /opt/app/public/uploads/* && tar -C /opt/app/public -xzf -" < "$DIR/uploads.tar.gz"

docker compose start cms web
echo "[restore] Completed in $(( $(date +%s) - START ))s. Verify content, users, API tokens and media in the admin panel."
