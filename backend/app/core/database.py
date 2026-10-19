"""Reusable SQL Server engine, session dependency, and read-only connection check."""

from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, URL
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import DatabaseSettings, get_database_settings


def build_database_url(settings: DatabaseSettings) -> URL:
    return URL.create(
        "mssql+pyodbc",
        username=settings.user if settings.auth == "sql" else None,
        password=settings.password if settings.auth == "sql" else None,
        host=settings.host,
        port=settings.port,
        database=settings.name,
        query={
            "driver": settings.driver,
            "Encrypt": settings.encrypt,
            "TrustServerCertificate": settings.trust_server_certificate,
        },
    )


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """Create the engine only when a database operation first needs it."""
    settings = get_database_settings()
    return create_engine(
        build_database_url(settings),
        pool_pre_ping=True,
        connect_args={"timeout": settings.connect_timeout},
    )


def get_db_session() -> Generator[Session, None, None]:
    """FastAPI dependency for later database-backed routes."""
    session_factory = sessionmaker(bind=get_engine(), autoflush=False)
    with session_factory() as session:
        yield session


def check_database_connection() -> bool:
    """Run a read-only SELECT 1 against SQL Server."""
    with get_engine().connect() as connection:
        return connection.execute(text("SELECT 1")).scalar_one() == 1


if __name__ == "__main__":
    from sqlalchemy.exc import SQLAlchemyError

    from app.core.config import DatabaseConfigurationError

    try:
        connected = check_database_connection()
    except (DatabaseConfigurationError, SQLAlchemyError):
        connected = False
    print("Database connection: available" if connected else "Database connection: unavailable")
    raise SystemExit(0 if connected else 1)
