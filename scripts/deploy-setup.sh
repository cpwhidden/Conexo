#!/usr/bin/env bash
# ============================================================
# Conexo GCP Deployment Setup Script
# Run once to provision all GCP infrastructure.
# Prerequisites: gcloud CLI authenticated, billing enabled.
# ============================================================
set -euo pipefail

# ----------------------------------------------------------
# CONFIGURATION - Edit these values before running
# ----------------------------------------------------------
PROJECT_ID="${GCP_PROJECT_ID:-conexo-prod}"
REGION="${GCP_REGION:-us-central1}"
DB_INSTANCE="conexo-db"
DB_NAME="conexo"
DB_USER="conexo_user"
SERVICE_NAME="conexo"
REPO_NAME="conexo"
BUCKET_NAME="conexo-media-prod"

echo "========================================="
echo "Conexo GCP Deployment Setup"
echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo "========================================="

# ----------------------------------------------------------
# 1. Set project and enable APIs
# ----------------------------------------------------------
echo "[1/8] Setting project and enabling APIs..."
gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  compute.googleapis.com

# ----------------------------------------------------------
# 2. Create Artifact Registry repository
# ----------------------------------------------------------
echo "[2/8] Creating Artifact Registry repository..."
gcloud artifacts repositories create "$REPO_NAME" \
  --repository-format=docker \
  --location="$REGION" \
  --description="Conexo container images" \
  2>/dev/null || echo "  (repository already exists)"

# ----------------------------------------------------------
# 3. Create Cloud SQL instance
# ----------------------------------------------------------
echo "[3/8] Creating Cloud SQL instance (this takes 3-5 minutes)..."
if gcloud sql instances describe "$DB_INSTANCE" --project="$PROJECT_ID" &>/dev/null; then
  echo "  (instance already exists)"
else
  gcloud sql instances create "$DB_INSTANCE" \
    --database-version=POSTGRES_16 \
    --edition=ENTERPRISE \
    --tier=db-f1-micro \
    --region="$REGION" \
    --storage-type=HDD \
    --storage-size=10GB \
    --database-flags=max_connections=20
fi

# Create database
echo "  Creating database..."
gcloud sql databases create "$DB_NAME" \
  --instance="$DB_INSTANCE" \
  2>/dev/null || echo "  (database already exists)"

# Generate and store password
DB_PASSWORD=$(openssl rand -base64 24)
echo "  Creating database user..."
gcloud sql users create "$DB_USER" \
  --instance="$DB_INSTANCE" \
  --password="$DB_PASSWORD" \
  2>/dev/null || echo "  (user already exists, password unchanged)"

CLOUD_SQL_CONNECTION="${PROJECT_ID}:${REGION}:${DB_INSTANCE}"
DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${CLOUD_SQL_CONNECTION}"

# ----------------------------------------------------------
# 4. Create secrets
# ----------------------------------------------------------
echo "[4/8] Storing secrets in Secret Manager..."
JWT_SECRET=$(openssl rand -base64 64)

create_or_update_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" --project="$PROJECT_ID" &>/dev/null; then
    echo "$value" | gcloud secrets versions add "$name" --data-file=-
    echo "  Updated secret: $name"
  else
    echo "$value" | gcloud secrets create "$name" --data-file=-
    echo "  Created secret: $name"
  fi
}

create_or_update_secret "CONEXO_DATABASE_URL" "$DATABASE_URL"
create_or_update_secret "CONEXO_JWT_SECRET_KEY" "$JWT_SECRET"

echo ""
echo "  NOTE: You must manually set these secrets:"
echo "    gcloud secrets create CONEXO_GOOGLE_CLIENT_ID --data-file=- <<< 'your-client-id'"
echo "    gcloud secrets create CONEXO_GCS_BUCKET_NAME --data-file=- <<< '$BUCKET_NAME'"
echo "    gcloud secrets create CONEXO_CORS_ORIGINS --data-file=- <<< 'https://your-domain.com'"

# ----------------------------------------------------------
# 5. Create GCS bucket for media
# ----------------------------------------------------------
echo "[5/8] Creating GCS bucket for media..."
gcloud storage buckets create "gs://$BUCKET_NAME" \
  --location="$REGION" \
  --uniform-bucket-level-access \
  2>/dev/null || echo "  (bucket already exists)"

# ----------------------------------------------------------
# 6. Set up IAM for Cloud Run service account
# ----------------------------------------------------------
echo "[6/8] Configuring IAM..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
COMPUTE_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Cloud Run default SA needs access to secrets and Cloud SQL
for role in "roles/secretmanager.secretAccessor" "roles/cloudsql.client" "roles/storage.objectAdmin"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$COMPUTE_SA" \
    --role="$role" \
    --quiet
done

# Cloud Build SA needs access to deploy
CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
for role in "roles/run.admin" "roles/iam.serviceAccountUser" "roles/secretmanager.secretAccessor"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$CLOUDBUILD_SA" \
    --role="$role" \
    --quiet
done

# ----------------------------------------------------------
# 7. Create Cloud Run migration job
# ----------------------------------------------------------
echo "[7/8] Creating Cloud Run migration job..."
gcloud run jobs create conexo-migrate \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest" \
  --region="$REGION" \
  --set-cloudsql-instances="$CLOUD_SQL_CONNECTION" \
  --set-secrets="CONEXO_DATABASE_URL=CONEXO_DATABASE_URL:latest" \
  --command="alembic" \
  --args="upgrade,head" \
  --max-retries=1 \
  --task-timeout=120 \
  2>/dev/null || echo "  (job already exists, will be updated on first deploy)"

# ----------------------------------------------------------
# 8. Initial deploy (placeholder - real deploy via Cloud Build)
# ----------------------------------------------------------
echo "[8/8] Setup complete!"
echo ""
echo "========================================="
echo "  NEXT STEPS"
echo "========================================="
echo ""
echo "1. Set remaining secrets (Google Client ID, etc.):"
echo "   See the NOTE in step 4 above."
echo ""
echo "2. Build and push the initial image:"
echo "   docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest ."
echo "   docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest"
echo ""
echo "3. Deploy to Cloud Run:"
echo "   gcloud run deploy ${SERVICE_NAME} \\"
echo "     --image ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:latest \\"
echo "     --region ${REGION} \\"
echo "     --platform managed \\"
echo "     --allow-unauthenticated \\"
echo "     --set-cloudsql-instances ${CLOUD_SQL_CONNECTION} \\"
echo "     --set-secrets CONEXO_DATABASE_URL=CONEXO_DATABASE_URL:latest,CONEXO_JWT_SECRET_KEY=CONEXO_JWT_SECRET_KEY:latest,CONEXO_GOOGLE_CLIENT_ID=CONEXO_GOOGLE_CLIENT_ID:latest,CONEXO_GCS_BUCKET_NAME=CONEXO_GCS_BUCKET_NAME:latest,CONEXO_CORS_ORIGINS=CONEXO_CORS_ORIGINS:latest \\"
echo "     --min-instances 0 \\"
echo "     --max-instances 2 \\"
echo "     --memory 512Mi \\"
echo "     --cpu 1"
echo ""
echo "4. Map your custom domain:"
echo "   gcloud run domain-mappings create \\"
echo "     --service ${SERVICE_NAME} \\"
echo "     --domain your-domain.com \\"
echo "     --region ${REGION}"
echo ""
echo "5. Set up Cloud Build trigger for auto-deploy:"
echo "   gcloud builds triggers create github \\"
echo "     --name=conexo-deploy \\"
echo "     --repo-owner=YOUR_GITHUB_USER \\"
echo "     --repo-name=Conexo \\"
echo "     --branch-pattern='^main$' \\"
echo "     --build-config=cloudbuild.yaml"
echo ""
echo "========================================="
echo "  CONNECTION INFO"
echo "========================================="
echo "Cloud SQL instance: $CLOUD_SQL_CONNECTION"
echo "GCS bucket: gs://$BUCKET_NAME"
echo "Artifact Registry: ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}"
echo ""
