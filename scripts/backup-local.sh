#!/usr/bin/env bash
# ============================================================
# Back up the local development PostgreSQL database.
#
# The local Docker volume (conexo_pgdata) is the working copy of the data,
# and nothing else backs it up. Run this before migrations or risky edits,
# and on a schedule if you want rolling protection.
#
# Usage:
#   ./scripts/backup-local.sh            # take a backup, prune old ones
#   RETAIN=30 ./scripts/backup-local.sh  # keep 30 instead of the default 14
# ============================================================
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backups"
RETAIN="${RETAIN:-14}"
DB_USER="conexo"
DB_NAME="conexo"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

mkdir -p "$BACKUP_DIR"

if ! docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
     pg_isready -U "$DB_USER" >/dev/null 2>&1; then
  echo -e "${RED}Postgres is not running.${NC} Start it first:"
  echo "  docker compose up -d postgres"
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTFILE="$BACKUP_DIR/conexo_backup_${TIMESTAMP}.sql"

echo -e "${YELLOW}Dumping ${DB_NAME}...${NC}"
# Write to a temp file first so an interrupted dump never looks like a good backup.
TMPFILE="${OUTFILE}.partial"
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U "$DB_USER" "$DB_NAME" > "$TMPFILE"

if [ ! -s "$TMPFILE" ]; then
  rm -f "$TMPFILE"
  echo -e "${RED}Dump was empty - backup aborted.${NC}"
  exit 1
fi

mv "$TMPFILE" "$OUTFILE"

MOVE_COUNT="$(awk '/^COPY public\.moves /{f=1;next} f&&/^\\\.$/{exit} f{c++} END{print c+0}' "$OUTFILE")"
SIZE="$(du -h "$OUTFILE" | cut -f1)"
echo -e "${GREEN}Wrote $(basename "$OUTFILE") (${SIZE}, ${MOVE_COUNT} moves)${NC}"

# ── Prune, keeping the newest $RETAIN dumps ──
# Plain while-read rather than mapfile, which needs bash 4 (macOS ships 3.2).
ls -1t "$BACKUP_DIR"/conexo_backup_*.sql 2>/dev/null | tail -n +"$((RETAIN + 1))" | while read -r f; do
  rm -f "$f"
  echo "  pruned $(basename "$f")"
done

echo -e "${GREEN}Done.${NC} $(ls -1 "$BACKUP_DIR"/conexo_backup_*.sql | wc -l | tr -d ' ') backups retained in backups/"
