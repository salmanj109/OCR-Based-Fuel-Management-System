"""Signup, login, logout, and session checks."""

import logging
import os
import secrets
from dataclasses import dataclass

import pyodbc
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import DatabaseConfigurationError
from app.services import auth, password_reset


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])
COOKIE_NAME = "fuel_session"
DATABASE_ERRORS = (DatabaseConfigurationError, SQLAlchemyError, pyodbc.Error)


class SignupInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordInput(BaseModel):
    email: EmailStr


class ResetPasswordInput(BaseModel):
    token: str = Field(min_length=32, max_length=128)
    password: str = Field(min_length=12, max_length=128)


@dataclass(frozen=True)
class CurrentSession:
    user: dict
    token: str


def _database_unavailable(error: Exception) -> HTTPException:
    logger.warning("Authentication database unavailable: %s", type(error).__name__)
    return HTTPException(status_code=503, detail="Authentication database is unavailable")


def _set_session_cookie(response: Response, token: str) -> None:
    secure = os.getenv("AUTH_COOKIE_SECURE", "false").strip().lower() in {"true", "yes", "1"}
    response.set_cookie(
        key=COOKIE_NAME, value=token, httponly=True, secure=secure,
        samesite="lax", max_age=auth.SESSION_DAYS * 24 * 60 * 60, path="/",
    )


def require_user(request: Request) -> CurrentSession:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Sign in to continue")
    try:
        user = auth.user_for_session(token)
    except DATABASE_ERRORS as error:
        raise _database_unavailable(error) from error
    if user is None:
        raise HTTPException(status_code=401, detail="Session expired; sign in again")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        supplied = request.headers.get("X-CSRF-Token", "")
        if not secrets.compare_digest(supplied, auth.csrf_token(token)):
            raise HTTPException(status_code=403, detail="Invalid request token")
    return CurrentSession(user=user, token=token)


@router.post("/signup", status_code=201)
def signup(payload: SignupInput, response: Response) -> dict:
    if not payload.name.strip():
        raise HTTPException(status_code=422, detail="Name is required")
    try:
        user, token = auth.create_account(payload.name, str(payload.email), payload.password)
    except auth.EmailAlreadyRegistered as error:
        raise HTTPException(status_code=409, detail="An account with this email already exists") from error
    except DATABASE_ERRORS as error:
        raise _database_unavailable(error) from error
    _set_session_cookie(response, token)
    return {"user": user, "csrf_token": auth.csrf_token(token)}


@router.post("/login")
def login(payload: LoginInput, response: Response) -> dict:
    try:
        user, token = auth.sign_in(str(payload.email), payload.password)
    except auth.InvalidCredentials as error:
        raise HTTPException(status_code=401, detail="Email or password is incorrect") from error
    except DATABASE_ERRORS as error:
        raise _database_unavailable(error) from error
    _set_session_cookie(response, token)
    return {"user": user, "csrf_token": auth.csrf_token(token)}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordInput) -> dict[str, str]:
    try:
        password_reset.request_password_reset(str(payload.email))
    except password_reset.EmailConfigurationError as error:
        raise HTTPException(status_code=503, detail="Password reset email is not configured") from error
    except password_reset.EmailDeliveryError as error:
        logger.warning("Password reset email delivery failed: %s", type(error.__cause__).__name__)
        raise HTTPException(status_code=503, detail="Could not send reset email. Try again later") from error
    except DATABASE_ERRORS as error:
        raise _database_unavailable(error) from error
    return {"message": "If an account exists for this email, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordInput, response: Response) -> dict[str, str]:
    try:
        password_reset.reset_password(payload.token, payload.password)
    except password_reset.InvalidResetToken as error:
        raise HTTPException(status_code=400, detail="Reset link is invalid or expired") from error
    except DATABASE_ERRORS as error:
        raise _database_unavailable(error) from error
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"message": "Password updated. Sign in with your new password."}


@router.get("/me")
def me(session: CurrentSession = Depends(require_user)) -> dict:
    return {"user": session.user, "csrf_token": auth.csrf_token(session.token)}


@router.post("/logout")
def logout(response: Response, session: CurrentSession = Depends(require_user)) -> dict:
    try:
        auth.revoke_session(session.token)
    except DATABASE_ERRORS as error:
        raise _database_unavailable(error) from error
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"status": "signed_out"}
