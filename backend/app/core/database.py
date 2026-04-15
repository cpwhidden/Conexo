from collections.abc import AsyncGenerator
from urllib.parse import parse_qs, urlparse

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings


def _build_engine():
    """Create the async engine, handling Cloud SQL Unix socket connections."""
    url = settings.database_url
    connect_args: dict = {}

    # For Cloud SQL Unix sockets: asyncpg needs the host passed via connect_args
    # The URL format is: postgresql+asyncpg://user:pass@/dbname?host=/cloudsql/INSTANCE
    parsed = urlparse(url)
    qs = parse_qs(parsed.query)
    if "host" in qs and qs["host"][0].startswith("/cloudsql/"):
        connect_args["host"] = qs["host"][0]
        # Remove host from URL query string to avoid double-passing
        # Rebuild URL without the host query param
        clean_url = url.split("?")[0]
        connect_args["ssl"] = False  # Cloud SQL proxy doesn't use SSL

    else:
        clean_url = url
        # Neon's pooled endpoint runs PgBouncer in transaction pooling mode,
        # which is incompatible with asyncpg's server-side prepared statement
        # cache. Disabling the cache is required when using `-pooler` hosts.
        connect_args["statement_cache_size"] = 0

    return create_async_engine(
        clean_url,
        echo=False,
        connect_args=connect_args,
        pool_pre_ping=True,
    )


engine = _build_engine()
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
