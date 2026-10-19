"""Minimal API entry point for local development."""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import DatabaseConfigurationError
from app.core.database import check_database_connection


def create_app() -> FastAPI:
    app = FastAPI(title="OCR Based Fuel Management System")
    origins = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/db", response_model=None)
    def database_health() -> dict[str, str] | JSONResponse:
        try:
            connected = check_database_connection()
        except (DatabaseConfigurationError, SQLAlchemyError):
            connected = False
        if not connected:
            return JSONResponse(status_code=503, content={"status": "unavailable"})
        return {"status": "ok"}

    return app


app = create_app()
