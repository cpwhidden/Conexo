#!/usr/bin/env bash
set -euo pipefail

# ============================================================
# Conexo — Start Development Servers
# ============================================================
# Starts PostgreSQL, backend, and frontend in one command.
# Backend and frontend run as background processes; Ctrl+C stops both.
# ============================================================

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# ── Load .env ────────────────────────────────────────────────

if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    source "$ROOT_DIR/.env"
    set +a
fi

GOOGLE_CLIENT_ID="${CONEXO_GOOGLE_CLIENT_ID:-}"

if [ -z "$GOOGLE_CLIENT_ID" ] || [ "$GOOGLE_CLIENT_ID" = "your-google-client-id.apps.googleusercontent.com" ]; then
    echo -e "${RED}ERROR: CONEXO_GOOGLE_CLIENT_ID is not set in .env${NC}"
    echo -e "Run the Google OAuth setup first: ${CYAN}scripts/google-oauth-setup.md${NC}"
    exit 1
fi

# ── Preflight checks ────────────────────────────────────────

if [ ! -d "$BACKEND_DIR/.venv" ]; then
    echo -e "${RED}ERROR: Backend venv not found. Run setup first:${NC}"
    echo -e "  ${CYAN}./scripts/setup.sh${NC}"
    exit 1
fi

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${RED}ERROR: Frontend node_modules not found. Run setup first:${NC}"
    echo -e "  ${CYAN}./scripts/setup.sh${NC}"
    exit 1
fi

# ── Trap: clean up on exit ───────────────────────────────────

BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down...${NC}"
    [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
    [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
    wait 2>/dev/null
    echo -e "${GREEN}All servers stopped.${NC}"
}
trap cleanup EXIT INT TERM

# ── Start PostgreSQL ─────────────────────────────────────────

echo -e "${CYAN}Starting PostgreSQL...${NC}"
cd "$ROOT_DIR"
docker compose up -d 2>&1

MAX_RETRIES=30
RETRY=0
until docker compose exec -T postgres pg_isready -U conexo >/dev/null 2>&1; do
    RETRY=$((RETRY + 1))
    if [ $RETRY -ge $MAX_RETRIES ]; then
        echo -e "${RED}PostgreSQL did not start in time.${NC}"
        exit 1
    fi
    sleep 1
done
echo -e "${GREEN}PostgreSQL ready${NC}"

# ── Start backend ────────────────────────────────────────────

echo -e "${CYAN}Starting backend (FastAPI)...${NC}"
cd "$BACKEND_DIR"
.venv/bin/uvicorn app.main:app --reload --port 8888 &
BACKEND_PID=$!
echo -e "${GREEN}Backend starting on http://localhost:8888${NC}"

# ── Start frontend ───────────────────────────────────────────

echo -e "${CYAN}Starting frontend (Vite)...${NC}"
cd "$FRONTEND_DIR"
VITE_GOOGLE_CLIENT_ID="$GOOGLE_CLIENT_ID" npx vite --port 5173 &
FRONTEND_PID=$!
echo -e "${GREEN}Frontend starting on http://localhost:5173${NC}"

# ── Wait ─────────────────────────────────────────────────────

echo ""
echo -e "${GREEN}╔══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         Conexo is running!           ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  App:  http://localhost:5173         ║${NC}"
echo -e "${GREEN}║  API:  http://localhost:8888         ║${NC}"
echo -e "${GREEN}║  Docs: http://localhost:8888/docs    ║${NC}"
echo -e "${GREEN}╠══════════════════════════════════════╣${NC}"
echo -e "${GREEN}║  Press Ctrl+C to stop all servers    ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════╝${NC}"
echo ""

wait
