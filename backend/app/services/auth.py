"""SQL Server users and opaque, revocable login sessions."""

import hashlib
import secrets
from contextlib import closing
from datetime import datetime, timedelta, timezone

import pyodbc
from pwdlib import PasswordHash

from app.core.database import get_engine


SESSION_DAYS = 7
ROLES = ("Admin", "Fleet Manager", "Fuel Coordinator", "Dispatcher", "Driver")
password_hash = PasswordHash.recommended()
dummy_hash = password_hash.hash("invalid-account-password")


class EmailAlreadyRegistered(Exception):
    pass


class InvalidCredentials(Exception):
    pass


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def csrf_token(token: str) -> str:
    """A request token derived from the unreadable session cookie."""
    return hashlib.sha256(("csrf:" + token).encode("utf-8")).hexdigest()


def _new_session(cursor: pyodbc.Cursor, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires_at = (datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)).replace(tzinfo=None)
    cursor.execute(
        "INSERT INTO dbo.AuthSessions ([TokenHash], [UserId], [ExpiresAt]) VALUES (?, ?, ?)",
        _token_hash(token), user_id, expires_at,
    )
    return token


def create_account(name: str, email: str, password: str) -> tuple[dict, str]:
    normalized_email = email.strip().lower()
    hashed_password = password_hash.hash(password)
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        try:
            cursor.execute("SELECT COUNT(*) FROM dbo.AuthUsers WITH (UPDLOCK, HOLDLOCK)")
            if cursor.fetchone()[0]:
                raise PermissionError("Accounts are created by an administrator")
            cursor.execute(
                "INSERT INTO dbo.AuthUsers ([Name], [Email], [PasswordHash], [Role]) "
                "OUTPUT INSERTED.[Id] VALUES (?, ?, ?, N'Admin')",
                name.strip(), normalized_email, hashed_password,
            )
            user_id = int(cursor.fetchone()[0])
            token = _new_session(cursor, user_id)
            connection.commit()
        except pyodbc.IntegrityError as error:
            connection.rollback()
            if "2601" in str(error) or "2627" in str(error):
                raise EmailAlreadyRegistered from error
            raise
        except Exception:
            connection.rollback()
            raise
    return {"id": user_id, "name": name.strip(), "email": normalized_email, "role": "Admin", "driver_id": None}, token


def sign_in(email: str, password: str) -> tuple[dict, str]:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT [Id], [Name], [Email], [PasswordHash], [Role], [DriverId] FROM dbo.AuthUsers WHERE [Email] = ? AND [IsActive] = 1",
            email.strip().lower(),
        )
        row = cursor.fetchone()

    stored_hash = str(row[3]) if row else dummy_hash
    if not password_hash.verify(password, stored_hash) or row is None:
        raise InvalidCredentials

    user = {"id": int(row[0]), "name": str(row[1]), "email": str(row[2]), "role": str(row[4]), "driver_id": row[5]}
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        try:
            cursor.execute("DELETE FROM dbo.AuthSessions WHERE [ExpiresAt] <= SYSUTCDATETIME()")
            token = _new_session(cursor, user["id"])
            connection.commit()
        except Exception:
            connection.rollback()
            raise
    return user, token


def user_for_session(token: str) -> dict | None:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT u.[Id], u.[Name], u.[Email], u.[Role], u.[DriverId] FROM dbo.AuthSessions s "
            "INNER JOIN dbo.AuthUsers u ON u.[Id] = s.[UserId] "
            "WHERE s.[TokenHash] = ? AND s.[ExpiresAt] > SYSUTCDATETIME() AND u.[IsActive] = 1",
            _token_hash(token),
        )
        row = cursor.fetchone()
    return {"id": int(row[0]), "name": str(row[1]), "email": str(row[2]), "role": str(row[3]), "driver_id": row[4]} if row else None


def list_users() -> list[dict]:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        cursor.execute("SELECT [Id], [Name], [Email], [Role], [DriverId], [IsActive] FROM dbo.AuthUsers ORDER BY [Id]")
        return [{"id": int(r[0]), "name": r[1], "email": r[2], "role": r[3], "driver_id": r[4], "is_active": bool(r[5])} for r in cursor.fetchall()]


def create_user(name: str, email: str, password: str, role: str, driver_id: int | None) -> dict:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        try:
            cursor.execute("INSERT INTO dbo.AuthUsers ([Name], [Email], [PasswordHash], [Role], [DriverId]) OUTPUT INSERTED.[Id] VALUES (?, ?, ?, ?, ?)", name.strip(), email.strip().lower(), password_hash.hash(password), role, driver_id)
            user_id = int(cursor.fetchone()[0])
            connection.commit()
            return {"id": user_id, "name": name.strip(), "email": email.strip().lower(), "role": role, "driver_id": driver_id, "is_active": True}
        except Exception:
            connection.rollback()
            raise


def update_user(user_id: int, role: str, driver_id: int | None, is_active: bool) -> bool:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        try:
            cursor.execute("UPDATE dbo.AuthUsers SET [Role]=?, [DriverId]=?, [IsActive]=? WHERE [Id]=?", role, driver_id, int(is_active), user_id)
            changed = cursor.rowcount > 0
            connection.commit()
            return changed
        except Exception:
            connection.rollback()
            raise


def revoke_session(token: str) -> None:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM dbo.AuthSessions WHERE [TokenHash] = ?", _token_hash(token))
        connection.commit()
