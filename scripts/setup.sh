#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Conexo — Local Development Setup
# ============================================================
# This script:
#   1. Checks prerequisites (Docker, Python, Node)
#   2. Creates .env from template if missing
#   3. Starts PostgreSQL via Docker Compose
#   4. Creates Python venv and installs backend deps
#   5. Installs frontend deps
#   6. Runs Alembic migration
#   7. Prints next steps
# ============================================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $1"; exit 1; }

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}║       Conexo — Local Dev Setup       ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════╝${NC}"
echo ""

# ── Step 1: Check prerequisites ──────────────────────────────

info "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || fail "Docker is required. Install from https://docs.docker.com/get-docker/"
ok "Docker found: $(docker --version | head -1)"

command -v python3 >/dev/null 2>&1 || fail "Python 3 is required."
PYTHON_VERSION=$(python3 --version 2>&1)
ok "Python found: $PYTHON_VERSION"

command -v node >/dev/null 2>&1 || fail "Node.js is required."
ok "Node found: $(node --version)"

command -v npm >/dev/null 2>&1 || fail "npm is required."
ok "npm found: $(npm --version)"

echo ""

# ── Step 2: Environment file ─────────────────────────────────

info "Checking environment configuration..."

if [ ! -f "$ROOT_DIR/.env" ]; then
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    warn ".env created from .env.example"
    warn "You MUST edit .env and set CONEXO_GOOGLE_CLIENT_ID before running the app."
    warn "See: scripts/google-oauth-setup.md for instructions."
    echo ""
else
    ok ".env file exists"
fi

# Check if Google Client ID is configured
if grep -q "your-google-client-id" "$ROOT_DIR/.env" 2>/dev/null; then
    warn "CONEXO_GOOGLE_CLIENT_ID is still the placeholder value."
    warn "Google Sign-In won't work until you set a real client ID."
    warn "See: scripts/google-oauth-setup.md"
    echo ""
fi

# ── Step 3: Start PostgreSQL ─────────────────────────────────

info "Starting PostgreSQL via Docker Compose..."

cd "$ROOT_DIR"
docker compose up -d 2>&1

# Wait for PostgreSQL to be ready
info "Waiting for PostgreSQL to accept connections..."
MAX_RETRIES=30
RETRY=0
until docker compose exec -T postgres pg_isready -U conexo >/dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        fail "PostgreSQL did not become ready in time."
    fi
    sleep 1
done
ok "PostgreSQL is ready"
echo ""

# ── Step 4: Backend setup ────────────────────────────────────

info "Setting up Python backend..."

if [ ! -d "$BACKEND_DIR/.venv" ]; then
    info "Creating virtual environment..."
    python3 -m venv "$BACKEND_DIR/.venv"
    ok "Virtual environment created at backend/.venv"
else
    ok "Virtual environment already exists"
fi

info "Installing Python dependencies..."
"$BACKEND_DIR/.venv/bin/pip" install --quiet --upgrade pip
"$BACKEND_DIR/.venv/bin/pip" install --quiet -r "$BACKEND_DIR/requirements.txt"
ok "Backend dependencies installed"
echo ""

# ── Step 5: Frontend setup ───────────────────────────────────

info "Setting up React frontend..."

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    info "Installing npm dependencies..."
    cd "$FRONTEND_DIR"
    npm install --silent
    ok "Frontend dependencies installed"
else
    ok "Frontend node_modules already exists"
fi
echo ""

# ── Step 6: Database migration ───────────────────────────────

info "Running database migrations..."

cd "$BACKEND_DIR"

# Check if any migration versions exist
if [ -z "$(ls -A "$BACKEND_DIR/alembic/versions/" 2>/dev/null)" ]; then
    info "Generating initial migration..."
    .venv/bin/alembic revision --autogenerate -m "initial schema" 2>&1
    ok "Migration generated"
fi

info "Applying migrations..."
.venv/bin/alembic upgrade head 2>&1
ok "Database is up to date"
echo ""

# ── Done ─────────────────────────────────────────────────────

echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Setup complete!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "To start the app, open ${YELLOW}two terminal tabs${NC}:"
echo ""
echo -e "  ${CYAN}Tab 1 — Backend:${NC}"
echo -e "    cd $BACKEND_DIR"
echo -e "    .venv/bin/uvicorn app.main:app --reload --port 8888"
echo -e "    ${GREEN}→ API at http://localhost:8888${NC}"
echo -e "    ${GREEN}→ Docs at http://localhost:8888/docs${NC}"
echo ""
echo -e "  ${CYAN}Tab 2 — Frontend:${NC}"
echo -e "    cd $FRONTEND_DIR"
echo -e "    VITE_GOOGLE_CLIENT_ID=\$CONEXO_GOOGLE_CLIENT_ID npm run dev"
echo -e "    ${GREEN}→ App at http://localhost:5173${NC}"
echo ""

if grep -q "your-google-client-id" "$ROOT_DIR/.env" 2>/dev/null; then
    echo -e "  ${RED}⚠  Don't forget to set your Google OAuth Client ID!${NC}"
    echo -e "  ${RED}   See: scripts/google-oauth-setup.md${NC}"
    echo ""
fi
