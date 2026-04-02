from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import auth, collections, connections, cues, media, moves, sequences, themes
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
app.include_router(themes.router, prefix="/api")
app.include_router(cues.router, prefix="/api")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
