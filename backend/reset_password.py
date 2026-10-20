"""Reset a local account password from the backend terminal.

Run from the backend folder with ``python reset_password.py``. Passwords are
entered without echoing and never passed as command-line arguments.
"""

from getpass import getpass

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import DatabaseConfigurationError
from app.core.database import get_engine
from app.services.auth import password_hash


def main() -> int:
    email = input("Account email: ").strip().lower()
    if not email:
        print("An account email is required.")
        return 1

    try:
        with get_engine().connect() as connection:
            user_id = connection.execute(
                text("SELECT [Id] FROM dbo.AuthUsers WHERE [Email] = :email"),
                {"email": email},
            ).scalar_one_or_none()
    except (DatabaseConfigurationError, SQLAlchemyError):
        print("Could not connect to the local account database.")
        return 1

    if user_id is None:
        print("No account exists with that email. Use Sign Up instead.")
        return 1

    password = getpass("New password (at least 12 characters): ")
    if not 12 <= len(password) <= 128:
        print("Password must contain 12 to 128 characters.")
        return 1
    if password != getpass("Confirm new password: "):
        print("Passwords did not match; no changes were made.")
        return 1

    try:
        with get_engine().begin() as connection:
            connection.execute(
                text("UPDATE dbo.AuthUsers SET [PasswordHash] = :password_hash WHERE [Id] = :user_id"),
                {"password_hash": password_hash.hash(password), "user_id": user_id},
            )
            connection.execute(
                text("DELETE FROM dbo.AuthSessions WHERE [UserId] = :user_id"),
                {"user_id": user_id},
            )
    except SQLAlchemyError:
        print("Password reset failed; no changes were saved.")
        return 1

    print("Password updated. Sign in with the new password.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
