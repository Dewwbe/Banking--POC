#!/usr/bin/env bash
# Workstream F — Dev → UAT → Production content movement using Strapi's built-in data management CLI
# (strapi export / import / transfer — available in Community Edition).
#
#   ./scripts/content-movement.sh export            # creates backups/strapi-export-<ts>.tar.gz.enc
#   ./scripts/content-movement.sh import <file>     # imports into THIS environment (DESTRUCTIVE: replaces content)
#   ./scripts/content-movement.sh transfer <url> <transfer-token>   # push directly to a remote Strapi
#
# Things to record in the report:
#   - import/transfer replaces ALL content in the destination (no selective / per-entry promotion)
#   - admin users, roles, API tokens and audit history are NOT moved
#   - schema changes travel through Git + deployment, content travels through this tool → two pipelines
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
TS=$(date -u +%Y%m%dT%H%M%SZ)
KEY=${TRANSFER_ENCRYPTION_KEY:-$ENCRYPTION_KEY}

case "${1:-}" in
  export)
    docker compose exec -T cms npm run strapi -- export --key "$KEY" --file "/tmp/strapi-export-$TS"
    docker compose cp "cms:/tmp/strapi-export-$TS.tar.gz.enc" "backups/"
    echo "Exported → backups/strapi-export-$TS.tar.gz.enc" ;;
  import)
    FILE=${2:?file required}
    docker compose cp "$FILE" "cms:/tmp/import.tar.gz.enc"
    docker compose exec -T cms npm run strapi -- import --key "$KEY" --file /tmp/import.tar.gz.enc --force ;;
  transfer)
    URL=${2:?destination admin URL required, e.g. https://uat-cms.example.com/admin}
    TOKEN=${3:?transfer token required (Settings → Transfer Tokens on the destination)}
    docker compose exec -T cms npm run strapi -- transfer --to "$URL" --to-token "$TOKEN" --force ;;
  *) echo "Usage: $0 export | import <file> | transfer <url> <token>"; exit 1 ;;
esac
