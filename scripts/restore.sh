#!/usr/bin/env bash
# Restore an ERPNext backup made by backup.sh.
#   ./scripts/restore.sh backups/20261024_020000
# Overwrites the live site database and files. Take a fresh backup first.
set -euo pipefail

DIR="${1:?usage: restore.sh <backup folder>}"
COMPOSE="docker compose -f docker-compose.prod.yml"
SITE="${ERP_SITE:-frontend}"

( cd "$DIR" && sha256sum -c SHA256SUMS )
read -r -p "This replaces ALL data on site '$SITE' with $DIR. Type the site name to continue: " ok
[ "$ok" = "$SITE" ] || { echo "aborted"; exit 1; }

DB=$(ls "$DIR"/*-database.sql.gz | head -1)
PUB=$(ls "$DIR"/*-files.tar* 2>/dev/null | grep -v private | head -1 || true)
PRIV=$(ls "$DIR"/*-private-files.tar* 2>/dev/null | head -1 || true)
TMP=/home/frappe/frappe-bench/sites/restore-tmp
$COMPOSE exec -T backend mkdir -p "$TMP"
for f in "$DB" $PUB $PRIV; do $COMPOSE cp "$f" "backend:$TMP/$(basename "$f")"; done

ARGS="$TMP/$(basename "$DB")"
[ -n "$PUB" ] && ARGS="$ARGS --with-public-files $TMP/$(basename "$PUB")"
[ -n "$PRIV" ] && ARGS="$ARGS --with-private-files $TMP/$(basename "$PRIV")"
$COMPOSE exec -T backend bash -c "bench --site $SITE restore $ARGS --db-root-password \"\$MARIADB_ROOT_PASSWORD\" && rm -rf $TMP"
$COMPOSE restart backend queue-short queue-long scheduler
echo "Restored. Sign in and spot-check stock levels."
