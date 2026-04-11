#!/usr/bin/env bash
# ============================================================
# Sync GCP production database + media files to local
# Run before working offline to get the latest production data.
# ============================================================
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-conexo-dance}"
REGION="${GCP_REGION:-asia-east1}"
DB_INSTANCE="conexo-db"
DB_NAME="conexo"
BUCKET_NAME="conexo-media-prod"
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}========================================="
echo "  Sync Production → Local"
echo -e "=========================================${NC}"
echo ""

# Confirm
read -p "This will OVERWRITE local data with production data. Continue? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

# ── Step 1: Export production DB to GCS ──
echo -e "${YELLOW}[1/5] Exporting production database...${NC}"
gcloud sql export sql "$DB_INSTANCE" "gs://$BUCKET_NAME/migrations/prod_export.sql" \
  --database="$DB_NAME" \
  --project="$PROJECT_ID" \
  --quiet

# ── Step 2: Download the dump ──
echo -e "${YELLOW}[2/5] Downloading dump...${NC}"
DUMP_FILE="/tmp/conexo_prod_dump.sql"
gcloud storage cp "gs://$BUCKET_NAME/migrations/prod_export.sql" "$DUMP_FILE" --quiet
echo -e "  ${GREEN}Downloaded: $(wc -l < "$DUMP_FILE") lines${NC}"

# ── Step 3: Import to local PostgreSQL ──
echo -e "${YELLOW}[3/5] Importing to local database...${NC}"
# The export includes schema + data, so drop and recreate
docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres psql -U conexo -c "
  DROP DATABASE IF EXISTS conexo;
  CREATE DATABASE conexo;
" postgres > /dev/null 2>&1 || true

docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres psql -U conexo conexo < "$DUMP_FILE" > /dev/null 2>&1
echo -e "  ${GREEN}Database import complete${NC}"

# ── Step 4: Sync media files from GCS ──
echo -e "${YELLOW}[4/5] Syncing media files from GCS...${NC}"
mkdir -p "$ROOT_DIR/backend/uploads"
gcloud storage rsync -r "gs://$BUCKET_NAME" "$ROOT_DIR/backend/uploads" \
  --exclude="migrations/.*" \
  --quiet
echo -e "  ${GREEN}Media sync complete${NC}"

# ── Step 5: Cleanup ──
echo -e "${YELLOW}[5/5] Cleaning up...${NC}"
gcloud storage rm "gs://$BUCKET_NAME/migrations/prod_export.sql" --quiet 2>/dev/null || true
rm -f "$DUMP_FILE"

echo ""
echo -e "${GREEN}========================================="
echo "  Sync from production complete!"
echo "  Local DB and media now match production."
echo -e "=========================================${NC}"
