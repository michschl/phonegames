#!/usr/bin/env bash
# Consistent backup of the SQLite database while the app keeps running.
# Usage on the VPS (e.g. daily via cron):  /opt/plausch/backup.sh
set -euo pipefail

cd "$(dirname "$0")"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="plausch-${STAMP}.db"

mkdir -p backups
docker compose exec -T app node --disable-warning=ExperimentalWarning server/src/backup.ts "/data/backups/${FILE}"
docker compose cp "app:/data/backups/${FILE}" "backups/${FILE}"
docker compose exec -T app rm -f "/data/backups/${FILE}"
gzip -f "backups/${FILE}"
find backups -name 'plausch-*.db.gz' -mtime "+${KEEP_DAYS}" -delete

echo "Backup: $(pwd)/backups/${FILE}.gz"
