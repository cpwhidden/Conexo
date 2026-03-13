from pathlib import Path

from pydantic_settings import BaseSettings

# Resolve the .env file relative to the project root (one level above backend/)
_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://conexo:conexo@localhost:5432/conexo"

    # JWT
    jwt_secret_key: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    # Google OAuth
    google_client_id: str = ""

    # Google Cloud Storage
    gcs_bucket_name: str = "conexo-videos"
    # For local dev: set to path of a service account key JSON, or empty for ADC
    gcs_credentials_path: str = ""
    # Use local filesystem storage instead of GCS (for development)
    use_local_storage: bool = True
    local_storage_path: str = "uploads"

    # CORS (comma-separated string, e.g. "http://localhost:5173,http://localhost:3000")
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origins_list(self) -> list[str]:
        # Strip any accidental JSON brackets (e.g. from shell-sourcing '["http://..."]')
        raw = self.cors_origins.strip("[] \"'")
        return [o.strip().strip("\"'") for o in raw.split(",") if o.strip()]

    model_config = {
        "env_prefix": "CONEXO_",
        "env_file": str(_ENV_FILE) if _ENV_FILE.exists() else None,
    }


settings = Settings()
