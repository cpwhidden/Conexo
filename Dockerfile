# ============================================================
# Conexo Production Dockerfile
# Multi-stage build: frontend assets + Python backend
# ============================================================

# --- Stage 1: Build frontend ---
FROM node:20-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY frontend/ ./
RUN npm run build

# --- Stage 2: Production backend ---
FROM python:3.12-slim AS production

# Prevent Python from writing .pyc and enable unbuffered stdout
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies for asyncpg
RUN apt-get update && \
    apt-get install -y --no-install-recommends libpq5 && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend application code
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini .

# Copy built frontend assets into a static directory
COPY --from=frontend-build /app/frontend/dist ./static

# Cloud Run sets PORT env var (default 8080)
ENV PORT=8080

# Run with gunicorn + uvicorn workers for production
# Cloud Run sends SIGTERM for graceful shutdown
RUN pip install --no-cache-dir gunicorn

EXPOSE 8080

CMD exec gunicorn app.main:app \
    --bind 0.0.0.0:$PORT \
    --workers 1 \
    --worker-class uvicorn.workers.UvicornWorker \
    --timeout 120 \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile -
