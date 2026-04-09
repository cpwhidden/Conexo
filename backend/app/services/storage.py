import uuid
from pathlib import Path

from app.core.config import settings

# GCS client (lazy-loaded only if using GCS)
_client = None


def _use_local() -> bool:
    """Check if we should use local filesystem storage."""
    return settings.use_local_storage


def _get_local_path() -> Path:
    """Get local storage directory path."""
    path = Path(settings.local_storage_path)
    path.mkdir(parents=True, exist_ok=True)
    return path


def _get_client():
    """Get GCS client (lazy-loaded)."""
    global _client
    if _client is None:
        from google.cloud import storage
        if settings.gcs_credentials_path:
            _client = storage.Client.from_service_account_json(
                settings.gcs_credentials_path
            )
        else:
            _client = storage.Client()
    return _client


def _get_bucket():
    """Get GCS bucket."""
    return _get_client().bucket(settings.gcs_bucket_name)


def upload_file(file_data: bytes, content_type: str, user_id: str) -> str:
    """Upload file and return the object key."""
    key = f"{user_id}/{uuid.uuid4()}"

    if _use_local():
        file_path = _get_local_path() / key
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_bytes(file_data)
    else:
        blob = _get_bucket().blob(key)
        blob.upload_from_string(file_data, content_type=content_type)

    return key


def generate_url(key: str) -> str:
    """Generate a URL for reading a file."""
    if _use_local():
        return f"/api/uploads/{key}"
    else:
        return f"https://storage.googleapis.com/{settings.gcs_bucket_name}/{key}"


def delete_file(key: str) -> None:
    """Delete a file."""
    if _use_local():
        file_path = _get_local_path() / key
        if file_path.exists():
            file_path.unlink()
    else:
        blob = _get_bucket().blob(key)
        blob.delete()
