from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import auth, collections, connections, cues, filters, media, moves, sequences, tags
from app.core.config import settings

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
