# Conexo - Claude Code Instructions

## Project Overview
Dance move organization web app. Users catalog moves with metadata, attach videos, and define connections between moves.

## Tech Stack
- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, PostgreSQL 16
- **Frontend**: React 18, TypeScript, Vite, React Router, Axios
- **Auth**: Google OAuth 2.0 (client-side token verification, no client secret needed)
- **Storage**: Google Cloud Storage for videos

## Project Structure
```
Conexo/
├── backend/
│   ├── app/
│   │   ├── api/routes/       # FastAPI route handlers
│   │   ├── core/             # Config, database, security
│   │   ├── models/           # SQLAlchemy models
│   │   └── schemas/          # Pydantic schemas
│   ├── alembic/versions/     # Database migrations
│   └── .venv/                # Python virtual environment
├── frontend/
│   └── src/
│       ├── components/       # Reusable React components
│       ├── pages/            # Route page components
│       └── types/            # TypeScript interfaces
├── prd/                      # Product Requirements Documents
│   └── prd_main.md           # Main PRD (consult before new features)
└── .env                      # Environment variables (CONEXO_ prefix)
```

## Development Commands

```bash
# Start everything (PostgreSQL + backend + frontend)
./scripts/start.sh

# Backend only (from backend/)
source .venv/bin/activate
uvicorn app.main:app --reload --port 8888

# Frontend only (from frontend/)
npm run dev

# Type checking
cd frontend && npx tsc --noEmit
cd backend && source .venv/bin/activate && python -c "from app.main import app"

# Database migrations
cd backend && alembic upgrade head
cd backend && alembic revision -m "description"  # Auto-generate (review carefully)
# For constraint changes: write migrations manually (DROP/CREATE constraints)
```

## Environment Variables
All prefixed with `CONEXO_` in `.env` at project root:
- `CONEXO_DATABASE_URL` - PostgreSQL connection string
- `CONEXO_JWT_SECRET_KEY` - JWT signing key
- `CONEXO_GOOGLE_CLIENT_ID` - Google OAuth client ID
- `CONEXO_CORS_ORIGINS` - Allowed origins (e.g., `http://localhost:5173`)
- `CONEXO_GCS_BUCKET_NAME` - Google Cloud Storage bucket

## Key Business Rules

### Move Types
- **Moves** (`is_state=false`): Have beat_count ≥1 and starting_beat 1-8 (required)
- **States** (`is_state=true`): Have beat_count=0 and starting_beat=null

### Score Ranges
| Field | Range | Required |
|-------|-------|----------|
| difficulty | 1-10 | Yes |
| familiarity | 1-10 | Yes |
| leadability | 1-10 | No |
| mental_availability | 0-10 | No |
| learning_priority | 0-10 | No |
| impact | 0-10 | No |
| beat_energy | 0-10 | No |
| sensual_energy | 0-10 | No |

### Dance Styles (enum)
Salsa, Bachata, Zouk, Kizomba, West Coast Swing, Lambada

### Connections
- One connection per (user, source_move, target_move) triple
- No self-connections (source ≠ target)

## Conventions

### File Naming
- Backend: snake_case (`move.py`, `auth.py`)
- Frontend: PascalCase for components (`MoveCard.tsx`), camelCase for utilities

### Database
- All timestamps: naive UTC (`datetime.now(timezone.utc).replace(tzinfo=None)`)
- Check constraints enforce business rules at DB level
- Cascade deletes: Move → Videos, Move → Connections

### API
- All routes under `/api/` prefix
- User-scoped data (filter by `current_user.id`)
- Pydantic schemas with `model_validator` for cross-field validation

### Frontend
- Types in `frontend/src/types/index.ts`
- API client in `frontend/src/api/client.ts` (auto-injects JWT)
- Protected routes wrap authenticated pages

## PRD Workflow

**Before implementing new features:**
1. Read `prd/prd_main.md` to understand existing requirements
2. Verify new feature doesn't conflict with documented constraints
3. Check validation rules that must be respected

**After implementing new features:**
1. Update PRD with new requirements
2. Add changelog entry with date

## Alembic Migration Notes
- Auto-generate works for column adds/removes
- **Manual migrations required for**:
  - Constraint changes (must DROP then CREATE)
  - Data backfills before NOT NULL changes
  - Complex column alterations
