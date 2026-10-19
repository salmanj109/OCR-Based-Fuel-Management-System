"""Load local configuration without overriding process environment variables."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env", override=False)


class DatabaseConfigurationError(Exception):
    """Required database configuration is absent or invalid."""


@dataclass(frozen=True)
class DatabaseSettings:
    host: str
    port: int
    name: str
    user: str
    password: str
    driver: str
    encrypt: str
    trust_server_certificate: str
    connect_timeout: int


def get_database_settings() -> DatabaseSettings:
    required = ("DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "DB_DRIVER")
    if any(not os.getenv(key, "").strip() for key in required):
        raise DatabaseConfigurationError("SQL Server configuration is incomplete")

    try:
        port = int(os.getenv("DB_PORT", "1433"))
        connect_timeout = int(os.getenv("DB_CONNECT_TIMEOUT", "5"))
    except ValueError as error:
        raise DatabaseConfigurationError("SQL Server port or timeout is invalid") from error
    if not 1 <= port <= 65535 or connect_timeout < 1:
        raise DatabaseConfigurationError("SQL Server port or timeout is invalid")

    encrypt = os.getenv("DB_ENCRYPT", "yes").strip().lower()
    trust_server_certificate = os.getenv("DB_TRUST_SERVER_CERTIFICATE", "no").strip().lower()
    if encrypt not in {"yes", "no"} or trust_server_certificate not in {"yes", "no"}:
        raise DatabaseConfigurationError("SQL Server TLS configuration is invalid")

    return DatabaseSettings(
        host=os.environ["DB_HOST"].strip(),
        port=port,
        name=os.environ["DB_NAME"].strip(),
        user=os.environ["DB_USER"].strip(),
        password=os.environ["DB_PASSWORD"],
        driver=os.environ["DB_DRIVER"].strip(),
        encrypt=encrypt,
        trust_server_certificate=trust_server_certificate,
        connect_timeout=connect_timeout,
    )
