"""Single-use password recovery links delivered through configured SMTP."""

import hashlib
import os
import secrets
import smtplib
import ssl
from contextlib import closing
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from urllib.parse import quote, urlparse

from app.core.database import get_engine
from app.services.auth import password_hash


RESET_MINUTES = 30
REQUEST_COOLDOWN_SECONDS = 60


class EmailConfigurationError(Exception):
    """Password reset email settings are missing or invalid."""


class EmailDeliveryError(Exception):
    """The configured mail server did not accept a reset message."""


class InvalidResetToken(Exception):
    """The link is missing, expired, or has already been used."""


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _mail_settings() -> tuple[str, int, str, str, str, str, str]:
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM", "").strip()
    frontend_url = os.getenv("FRONTEND_PUBLIC_URL", "").strip().rstrip("/")
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "")
    security = os.getenv("SMTP_SECURITY", "starttls").strip().lower()
    parsed_url = urlparse(frontend_url)
    try:
        port = int(os.getenv("SMTP_PORT", "587"))
    except ValueError as error:
        raise EmailConfigurationError from error
    if (
        not host or not sender or not frontend_url or not 1 <= port <= 65535
        or security not in {"starttls", "ssl"}
        or (username and not password)
        or parsed_url.scheme not in {"http", "https"}
        or not parsed_url.netloc or parsed_url.username or parsed_url.password
        or parsed_url.path not in {"", "/"} or parsed_url.query or parsed_url.fragment
    ):
        raise EmailConfigurationError
    if parsed_url.scheme == "http" and parsed_url.hostname not in {"localhost", "127.0.0.1"}:
        raise EmailConfigurationError
    return host, port, sender, username, password, security, frontend_url


def _send_reset_email(recipient: str, token: str, settings: tuple[str, int, str, str, str, str, str]) -> None:
    host, port, sender, username, password, security, frontend_url = settings
    link = f"{frontend_url}/reset-password?token={quote(token, safe='')}"
    message = EmailMessage()
    message["Subject"] = "Reset your Flevio password"
    message["From"] = sender
    message["To"] = recipient
    message.set_content(
        "A password reset was requested for your Flevio account.\n\n"
        f"Open this link within {RESET_MINUTES} minutes to set a new password:\n{link}\n\n"
        "If you did not request this, ignore this email.\n"
    )
    try:
        context = ssl.create_default_context()
        if security == "ssl":
            with smtplib.SMTP_SSL(host, port, timeout=10, context=context) as smtp:
                if username:
                    smtp.login(username, password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(host, port, timeout=10) as smtp:
                smtp.starttls(context=context)
                if username:
                    smtp.login(username, password)
                smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        raise EmailDeliveryError from error


def request_password_reset(email: str) -> None:
    """Send a link if the account exists; callers return the same reply either way."""
    settings = _mail_settings()
    normalized_email = email.strip().lower()
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        cursor.execute("SELECT [Id] FROM dbo.AuthUsers WHERE [Email] = ?", normalized_email)
        row = cursor.fetchone()
        if row is None:
            return
        user_id = int(row[0])
        cursor.execute(
            "SELECT [CreatedAt] FROM dbo.AuthPasswordResets WHERE [UserId] = ?", user_id
        )
        previous = cursor.fetchone()
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if previous and previous[0] > now - timedelta(seconds=REQUEST_COOLDOWN_SECONDS):
            return
        token = secrets.token_urlsafe(32)
        token_hash = _token_hash(token)
        try:
            cursor.execute("DELETE FROM dbo.AuthPasswordResets WHERE [UserId] = ?", user_id)
            cursor.execute(
                "INSERT INTO dbo.AuthPasswordResets ([TokenHash], [UserId], [ExpiresAt]) "
                "VALUES (?, ?, ?)",
                token_hash, user_id, now + timedelta(minutes=RESET_MINUTES),
            )
            connection.commit()
        except Exception:
            connection.rollback()
            raise

    try:
        _send_reset_email(normalized_email, token, settings)
    except EmailDeliveryError:
        with closing(get_engine().raw_connection()) as connection:
            cursor = connection.cursor()
            cursor.execute("DELETE FROM dbo.AuthPasswordResets WHERE [TokenHash] = ?", token_hash)
            connection.commit()
        raise


def reset_password(token: str, new_password: str) -> None:
    """Use the link once, replace the password, and revoke every active session."""
    hashed_password = password_hash.hash(new_password)
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        try:
            cursor.execute(
                "SELECT [UserId] FROM dbo.AuthPasswordResets WITH (UPDLOCK, HOLDLOCK) "
                "WHERE [TokenHash] = ? AND [ExpiresAt] > SYSUTCDATETIME()",
                _token_hash(token),
            )
            row = cursor.fetchone()
            if row is None:
                connection.rollback()
                raise InvalidResetToken
            user_id = int(row[0])
            cursor.execute(
                "UPDATE dbo.AuthUsers SET [PasswordHash] = ? WHERE [Id] = ?",
                hashed_password, user_id,
            )
            cursor.execute("DELETE FROM dbo.AuthSessions WHERE [UserId] = ?", user_id)
            cursor.execute("DELETE FROM dbo.AuthPasswordResets WHERE [UserId] = ?", user_id)
            connection.commit()
        except Exception:
            connection.rollback()
            raise
