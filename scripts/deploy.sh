#!/usr/bin/env bash
# ============================================================
# Conexo Manual Deploy Script
# Use this for quick manual deploys (alternative to Cloud Build)
# ============================================================
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-conexo-prod}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="conexo"
REPO_NAME="conexo"
CLOUD_SQL_INSTANCE="${PROJECT_ID}:${REGION}:conexo-db"

IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "manual")

# Fetch Google Client ID from Secret Manager for frontend build
GOOGLE_CLIENT_ID=$(gcloud secrets versions access latest --secret=CONEXO_GOOGLE_CLIENT_ID 2>/dev/null || echo "")

echo "Deploying Conexo (tag: $TAG)..."
echo ""

# Step 1: Build
echo "[1/4] Building Docker image..."
docker build --platform linux/amd64 \
  --build-arg VITE_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" \
  -t "${IMAGE}:${TAG}" -t "${IMAGE}:latest" .

# Step 2: Push
echo "[2/4] Pushing to Artifact Registry..."
docker push "${IMAGE}:${TAG}"
docker push "${IMAGE}:latest"

# Step 3: Run migrations
echo "[3/4] Running database migrations..."
gcloud run jobs update conexo-migrate \
  --image "${IMAGE}:${TAG}" \
  --region "$REGION" \
  --set-cloudsql-instances "$CLOUD_SQL_INSTANCE" \
  --set-secrets "CONEXO_DATABASE_URL=CONEXO_DATABASE_URL:latest" \
  --quiet

gcloud run jobs execute conexo-migrate \
  --region "$REGION" \
  --wait

# Step 4: Deploy
echo "[4/4] Deploying to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "${IMAGE}:${TAG}" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --set-cloudsql-instances "$CLOUD_SQL_INSTANCE" \
  --set-secrets "CONEXO_DATABASE_URL=CONEXO_DATABASE_URL:latest,CONEXO_JWT_SECRET_KEY=CONEXO_JWT_SECRET_KEY:latest,CONEXO_GOOGLE_CLIENT_ID=CONEXO_GOOGLE_CLIENT_ID:latest,CONEXO_GCS_BUCKET_NAME=CONEXO_GCS_BUCKET_NAME:latest,CONEXO_CORS_ORIGINS=CONEXO_CORS_ORIGINS:latest" \
  --set-env-vars "CONEXO_USE_LOCAL_STORAGE=false" \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1

echo ""
echo "Deploy complete. Service URL:"
gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format="value(status.url)"
