"""Signup, login, logout, and session checks."""

import logging
import os
import secrets
from dataclasses import dataclass
from typing import Literal

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


def require_roles(*roles: str):
    def check(session: CurrentSession = Depends(require_user)) -> CurrentSession:
        if session.user["role"] not in roles:
            raise HTTPException(status_code=403, detail="This role cannot access this resource")
        return session
    return check


class UserCreateInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    role: Literal["Admin", "Fleet Manager", "Fuel Coordinator", "Dispatcher", "Driver"]
    driver_id: int | None = None


class UserRoleInput(BaseModel):
    role: Literal["Admin", "Fleet Manager", "Fuel Coordinator", "Dispatcher", "Driver"]
    driver_id: int | None = None
    is_active: bool = True


def validate_driver_link(role: str, driver_id: int | None) -> None:
    if role == "Driver" and driver_id is None:
        raise HTTPException(status_code=422, detail="Driver accounts require a linked driver")
    if role != "Driver" and driver_id is not None:
        raise HTTPException(status_code=422, detail="Only driver accounts can link a driver")
    if driver_id is not None:
        from app.services import data
        if data.get_driver(driver_id) is None:
            raise HTTPException(status_code=422, detail="Driver not found")


@router.post("/signup", status_code=201)
def signup(payload: SignupInput, response: Response) -> dict:
    if not payload.name.strip():
        raise HTTPException(status_code=422, detail="Name is required")
    try:
        user, token = auth.create_account(payload.name, str(payload.email), payload.password)
    except auth.EmailAlreadyRegistered as error:
        raise HTTPException(status_code=409, detail="An account with this email already exists") from error
    except PermissionError as error:
        raise HTTPException(status_code=403, detail=str(error)) from error
    except DATABASE_ERRORS as error:
        raise _database_unavailable(error) from error
    _set_session_cookie(response, token)
    return {"user": user, "csrf_token": auth.csrf_token(token)}


@router.get("/users")
def users(session: CurrentSession = Depends(require_roles("Admin"))) -> list[dict]:
    try:
        return auth.list_users()
    except DATABASE_ERRORS as error:
        raise _database_unavailable(error) from error


@router.post("/users", status_code=201)
def create_user(payload: UserCreateInput, session: CurrentSession = Depends(require_roles("Admin"))) -> dict:
    try:
        validate_driver_link(payload.role, payload.driver_id)
        return auth.create_user(payload.name, str(payload.email), payload.password, payload.role, payload.driver_id)
    except pyodbc.IntegrityError as error:
        raise HTTPException(status_code=409, detail="Email or driver account is already linked") from error
    except DATABASE_ERRORS as error:
        raise _database_unavailable(error) from error


@router.put("/users/{user_id}")
def change_user(user_id: int, payload: UserRoleInput, session: CurrentSession = Depends(require_roles("Admin"))) -> dict:
    if user_id == session.user["id"] and (payload.role != "Admin" or not payload.is_active):
        raise HTTPException(status_code=422, detail="You cannot remove your own administrator access")
    try:
        validate_driver_link(payload.role, payload.driver_id)
        if not auth.update_user(user_id, payload.role, payload.driver_id, payload.is_active):
            raise HTTPException(status_code=404, detail="User not found")
        return next(user for user in auth.list_users() if user["id"] == user_id)
    except pyodbc.IntegrityError as error:
        raise HTTPException(status_code=409, detail="Driver account is already linked") from error
    except DATABASE_ERRORS as error:
        raise _database_unavailable(error) from error


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
