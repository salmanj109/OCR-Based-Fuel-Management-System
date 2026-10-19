# OCR Based Fuel Management System

This repository has a minimal React/TypeScript frontend and a FastAPI backend with configurable SQL Server connectivity. No project tables, models, or application features have been added to the new backend.

## Structure

```text
frontend/              React + TypeScript + Vite application
  src/                 Minimal startup screen
  public/              Static assets (currently empty)
  .env.example         Future frontend configuration reference
backend/               Independent Python application
  app/main.py          FastAPI entry point and health endpoints
  app/core/            SQL Server configuration, engine, and session provider
  tests/               Offline database configuration checks
  requirements.txt     Backend-only dependencies
  .env.example         CORS and SQL Server configuration template
api.py, app*.py        Existing Python implementation (preserved)
scripts/, generated_maps/, Dockerfile, docker-compose.yml
                       Existing project assets and deployment files (preserved)
docs/legacy-readme.md  Previous README with legacy application notes
```

The existing root Python files and Docker configuration belong to the earlier application. They are preserved and are **not** part of the new minimal frontend/backend startup commands below. No database schema or existing data was changed.

## Open the backend in Visual Studio

In Visual Studio, choose **File → Open → Folder** and select this repository's `backend/` folder. Solution Explorer will show `app/main.py`, `app/core/`, `tests/`, `requirements.txt`, and `.env.example` in Folder View. A `.sln` or `.pyproj` file is not needed for Folder View. Install Visual Studio's Python development support if Python tools are not available.

Use a terminal in Visual Studio with its working directory set to `backend/`, select the `backend/.venv` Python interpreter, and run `python -m uvicorn app.main:app --reload --port 8000`. If you open the repository root instead, use the root-directory command in the next section so the legacy `app.py` is not imported by mistake.

## Prerequisites

- Node.js 20.19+ or 22.12+ and npm
- Python 3.10+
- For database connectivity: a reachable Microsoft SQL Server instance with TCP/IP enabled, a database and SQL-authentication account, and a Microsoft ODBC Driver for SQL Server installed on the backend machine. Driver 17 is installed in this development environment; Driver 18 is also supported.

## Start the backend

From `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env with your own database connection values.
python -m uvicorn app.main:app --reload --port 8000
```

If your terminal is at the repository root (`OCR-Based-Fuel-Management-System`), use this command instead:

```powershell
& .\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --port 8000
```

The repository also contains a legacy root `app.py`. Starting `uvicorn app.main:app` from the repository root without `--app-dir backend` imports that file instead of the new backend package and fails with `Could not import module "app.main"`.

Visit `http://localhost:8000/health`. It returns `{"status":"ok"}` without contacting the database. `http://localhost:8000/health/db` runs a read-only `SELECT 1` and returns `{"status":"ok"}` on success or HTTP 503 with `{"status":"unavailable"}` on failure. It does not return connection details. FastAPI's generated docs are at `http://localhost:8000/docs`.

### SQL Server configuration

1. Ensure SQL Server accepts TCP connections on the configured host and port (default `1433`) and that the database and SQL-authentication user already exist. This setup does not create them.
2. Install Microsoft ODBC Driver 17 or 18 for SQL Server on the backend machine. Use the installed driver name in `DB_DRIVER`. On Windows, the ODBC Data Sources administrator can show installed drivers.
3. Edit `backend/.env`: set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, and `DB_DRIVER`. `DB_ENCRYPT=yes` and `DB_TRUST_SERVER_CERTIFICATE=no` are the secure defaults. For a local SQL Server using a self-signed certificate, you can set `DB_TRUST_SERVER_CERTIFICATE=yes` for development.
4. Run `python -m app.core.database` from `backend/` to perform the same read-only check. It prints only `available` or `unavailable` and exits with code 0 or 1. You can also call `/health/db`.

The backend loads `backend/.env` if present without overriding environment variables already set in the process. `.env` is Git-ignored. The SQLAlchemy engine is created lazily; a missing or offline SQL Server does not prevent `/health` from responding. The reusable `get_db_session()` dependency is ready for later database routes. No tables or ORM models are created here.

The backend accepts `http://localhost:5173` as the development CORS origin by default. To change it, set `CORS_ORIGINS` before starting Uvicorn, with comma-separated origins if needed:

```powershell
$env:CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"
```

`CORS_ORIGINS` can be set in `backend/.env` or in the process environment.

Run the offline database checks from `backend/` with `python -m unittest discover -s tests -v`.

## Start the frontend

In a separate terminal, from `frontend/`:

```powershell
npm install
npm run dev
```

Visit the local URL printed by Vite, normally `http://localhost:5173`. For a production build check, run `npm run build` from `frontend/`.

The frontend and backend start independently. The frontend does not call the API yet.

## Later integration

OpenRouteService, Leaflet/OpenStreetMap, PDF processing/OCR, and AI integration are reserved for later steps. Example environment files contain placeholders only. The existing legacy code documents its own earlier dependencies in the root `requirements.txt` and `docs/legacy-readme.md`.
