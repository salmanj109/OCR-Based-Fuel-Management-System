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
    port: int | None
    name: str
    user: str
    password: str
    driver: str
    encrypt: str
    trust_server_certificate: str
    connect_timeout: int
    auth: str = "sql"


def get_database_settings() -> DatabaseSettings:
    required = ("DB_HOST", "DB_NAME", "DB_DRIVER")
    if any(not os.getenv(key, "").strip() for key in required):
        raise DatabaseConfigurationError("SQL Server configuration is incomplete")

    auth = os.getenv("DB_AUTH", "sql").strip().lower()
    if auth not in {"sql", "windows"}:
        raise DatabaseConfigurationError("DB_AUTH must be sql or windows")
    if auth == "sql" and any(not os.getenv(key, "").strip() for key in ("DB_USER", "DB_PASSWORD")):
        raise DatabaseConfigurationError("SQL Server username or password is missing")

    try:
        port_text = os.getenv("DB_PORT", "1433").strip()
        port = int(port_text) if port_text else None
        connect_timeout = int(os.getenv("DB_CONNECT_TIMEOUT", "5"))
    except ValueError as error:
        raise DatabaseConfigurationError("SQL Server port or timeout is invalid") from error
    if (port is not None and not 1 <= port <= 65535) or connect_timeout < 1:
        raise DatabaseConfigurationError("SQL Server port or timeout is invalid")

    encrypt = os.getenv("DB_ENCRYPT", "yes").strip().lower()
    trust_server_certificate = os.getenv("DB_TRUST_SERVER_CERTIFICATE", "no").strip().lower()
    if encrypt not in {"yes", "no"} or trust_server_certificate not in {"yes", "no"}:
        raise DatabaseConfigurationError("SQL Server TLS configuration is invalid")

    return DatabaseSettings(
        host=os.environ["DB_HOST"].strip(),
        port=port,
        name=os.environ["DB_NAME"].strip(),
        user=os.getenv("DB_USER", "").strip() if auth == "sql" else "",
        password=os.getenv("DB_PASSWORD", "") if auth == "sql" else "",
        driver=os.environ["DB_DRIVER"].strip(),
        encrypt=encrypt,
        trust_server_certificate=trust_server_certificate,
        connect_timeout=connect_timeout,
        auth=auth,
    )
