from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import admin, auth, collections, connections, cues, filters, media, moves, sequences, tags
from app.core.config import settings

# Safety guard (default-deny): the SSO-bypass dev login may ONLY run in an
# explicitly local/development environment. Any other value of CONEXO_ENV
# (including an unset/typo'd one) refuses to boot when dev auth is enabled,
# so a misconfigured production can never silently expose /auth/dev-login.
_DEV_AUTH_ENVIRONMENTS = {"local", "development", "dev", "test"}
if settings.dev_auth and settings.environment.lower() not in _DEV_AUTH_ENVIRONMENTS:
    raise RuntimeError(
        "CONEXO_DEV_AUTH may only be enabled when CONEXO_ENV is one of "
        f"{sorted(_DEV_AUTH_ENVIRONMENTS)} (got '{settings.environment}')"
    )

app = FastAPI(title="Conexo", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(moves.router, prefix="/api")
app.include_router(media.router, prefix="/api")
app.include_router(connections.router, prefix="/api")
app.include_router(collections.router, prefix="/api")
app.include_router(sequences.router, prefix="/api")
app.include_router(tags.router, prefix="/api")
app.include_router(filters.router, prefix="/api")
app.include_router(cues.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ---------------------------------------------------------------------------
# Serve frontend static files in production
# In production, the Dockerfile copies built frontend assets into /app/static.
# This mount MUST come after all /api routes to avoid shadowing them.
# ---------------------------------------------------------------------------
_static_dir = Path(__file__).resolve().parents[1] / "static"
if _static_dir.is_dir():
    app.mount("/assets", StaticFiles(directory=_static_dir / "assets"), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve index.html for all non-API, non-asset routes (SPA client-side routing)."""
        # If a specific static file exists, serve it (favicon.ico, etc.)
        file_path = _static_dir / full_path
        if full_path and file_path.is_file():
            return FileResponse(file_path)
        # Otherwise serve index.html for client-side routing
        return FileResponse(_static_dir / "index.html")
