#!/usr/bin/env bash
# ERPNext backup (database + public/private files) copied out of the container.
# Cron, daily:  0 2 * * *  cd /srv/esme-ims && ./scripts/backup.sh >> backups/backup.log 2>&1
set -euo pipefail

COMPOSE="docker compose -f docker-compose.prod.yml"
SITE="${ERP_SITE:-frontend}"
DEST="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "$DEST"
echo "== $(date -Is) backing up site $SITE"
$COMPOSE exec -T backend bench --site "$SITE" backup --with-files --compress

STAMP=$(date +%Y%m%d_%H%M%S)
OUT="$DEST/$STAMP"
mkdir -p "$OUT"
# Copy the newest backup set out of the shared sites volume.
$COMPOSE exec -T backend bash -c "cd sites/$SITE/private/backups && ls -t | head -4" | while read -r f; do
  $COMPOSE cp "backend:/home/frappe/frappe-bench/sites/$SITE/private/backups/$f" "$OUT/$f"
done
( cd "$OUT" && sha256sum * > SHA256SUMS )
echo "== saved to $OUT ($(du -sh "$OUT" | cut -f1))"

find "$DEST" -mindepth 1 -maxdepth 1 -type d -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
