#!/usr/bin/env bash
# ============================================================
# Sync local database + media files to GCP production
# Run after making data changes locally that you want in prod.
# ============================================================
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-conexo-dance}"
REGION="${GCP_REGION:-asia-east1}"
DB_INSTANCE="conexo-db"
DB_NAME="conexo"
DB_USER="conexo_user"
BUCKET_NAME="conexo-media-prod"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}========================================="
echo "  Sync Local → Production"
echo -e "=========================================${NC}"
echo ""

# Confirm
read -p "This will OVERWRITE production data with local data. Continue? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# ── Step 1: Temporarily null cover_media_id to avoid circular FK ──
echo -e "${YELLOW}[1/6] Preparing local data...${NC}"
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres psql -U conexo conexo -c "
  CREATE TEMP TABLE _cover_backup AS SELECT id, cover_media_id FROM moves WHERE cover_media_id IS NOT NULL;
  UPDATE moves SET cover_media_id = NULL;
" > /dev/null

# ── Step 2: Dump local data ──
echo -e "${YELLOW}[2/6] Dumping local database...${NC}"
DUMP_FILE="/tmp/conexo_sync_dump.sql"

cat > "$DUMP_FILE" << 'EOF'
TRUNCATE public.users CASCADE;
TRUNCATE public.collections CASCADE;
TRUNCATE public.moves CASCADE;
TRUNCATE public.sequences CASCADE;
EOF

docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres pg_dump -U conexo conexo \
  --data-only --no-owner --no-privileges --exclude-table=alembic_version \
  2>/dev/null | grep -v "^pg_dump:" >> "$DUMP_FILE"

# Append cover_media_id restore
echo "" >> "$DUMP_FILE"
echo "-- Restore cover_media_id" >> "$DUMP_FILE"
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres psql -U conexo conexo -t -A -c "
  SELECT 'UPDATE public.moves SET cover_media_id = ''' || cover_media_id || ''' WHERE id = ''' || id || ''';'
  FROM _cover_backup;
" >> "$DUMP_FILE"

# ── Step 3: Restore cover_media_id locally ──
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres psql -U conexo conexo -c "
  UPDATE moves m SET cover_media_id = b.cover_media_id FROM _cover_backup b WHERE m.id = b.id;
" > /dev/null

LINES=$(wc -l < "$DUMP_FILE")
echo -e "  ${GREEN}Dump complete: $LINES lines${NC}"

# ── Step 4: Upload and import to Cloud SQL ──
echo -e "${YELLOW}[3/6] Uploading to GCS...${NC}"
gcloud storage cp "$DUMP_FILE" "gs://$BUCKET_NAME/migrations/sync_dump.sql" --quiet

echo -e "${YELLOW}[4/6] Importing to Cloud SQL...${NC}"
gcloud sql import sql "$DB_INSTANCE" "gs://$BUCKET_NAME/migrations/sync_dump.sql" \
  --database="$DB_NAME" \
  --user="$DB_USER" \
  --project="$PROJECT_ID" \
  --quiet

echo -e "  ${GREEN}Database import complete${NC}"

# ── Step 5: Sync media files ──
echo -e "${YELLOW}[5/6] Syncing media files to GCS...${NC}"
if [ -d "$ROOT_DIR/backend/uploads" ] && [ "$(ls -A "$ROOT_DIR/backend/uploads" 2>/dev/null)" ]; then
  gcloud storage rsync -r "$ROOT_DIR/backend/uploads" "gs://$BUCKET_NAME" \
    --delete-unmatched-destination-objects=false \
    --quiet
  echo -e "  ${GREEN}Media sync complete${NC}"
else
  echo -e "  ${YELLOW}No local uploads to sync${NC}"
fi

# ── Step 6: Cleanup ──
echo -e "${YELLOW}[6/6] Cleaning up...${NC}"
gcloud storage rm "gs://$BUCKET_NAME/migrations/sync_dump.sql" --quiet 2>/dev/null || true
rm -f "$DUMP_FILE"

echo ""
echo -e "${GREEN}========================================="
echo "  Sync to production complete!"
echo -e "=========================================${NC}"
