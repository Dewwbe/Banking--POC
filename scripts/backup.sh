#!/usr/bin/env bash
# Workstream F — PostgreSQL + media backup.
# Produces backups/<timestamp>/{db.dump,uploads.tar.gz,SHA256SUMS}
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="backups/$TS"
mkdir -p "$OUT"

echo "[backup] Dumping database ${DATABASE_NAME} …"
docker compose exec -T db pg_dump -U "$DATABASE_USERNAME" -d "$DATABASE_NAME" -Fc > "$OUT/db.dump"

echo "[backup] Archiving media volume …"
docker compose exec -T cms tar -C /opt/app/public -czf - uploads > "$OUT/uploads.tar.gz"

( cd "$OUT" && sha256sum db.dump uploads.tar.gz > SHA256SUMS )
echo "[backup] Done → $OUT"
cat "$OUT/SHA256SUMS"
