# OCR Based Fuel Management System

React/TypeScript frontend with a FastAPI backend. The new application reuses the repository's existing Python PDF parser, truck registry, trip planner, SQL Server queries, and OpenRouteService routing code. No database tables or ORM models are created by this project.

The team integration branch is `ORC_Main`. Each of the three contributors should develop on a separate branch and open a pull request into `ORC_Main`; see [CONTRIBUTING.md](CONTRIBUTING.md). Existing root Python files remain in place for the earlier Streamlit application.

## Current modules

| Screen | What it does | Existing source reused |
| --- | --- | --- |
| Dashboard | Shows truck count, trip count, estimated fuel demand, recent trips, and the latest route in this browser session | Existing SQL Server tables and trip calculations |
| Truck Registry | Lists, adds, edits, and deletes registered trucks | `app_1.py` schema discovery and writes |
| Fuel Prices | Extracts rows from a supported text PDF, lets a user review/edit them, then updates matching existing price rows | `app.py` PDF parser and update logic |
| Trip Planner | Resolves locations, gets an OpenRouteService route, estimates fuel from the selected truck, recommends stops, and saves a trip | `app_2.py` routing, fuel rules, stations, and trip insert |
| Fuel Stops | Shows existing station locations and recommendations from the latest plan | `app_2.py` station data and stop selection |
| Trip History | Lists and searches saved trips | Existing `Trip_Records` table |

The existing PDF parser extracts **text**, not scanned-image OCR. No AI integration, authentication, or role system exists. Keep write endpoints on a trusted local network until authorization is designed. Station availability and fuel price freshness are not verified. `Trip_Records` does not store the trip's fuel status or its route geometry, so those are available only for the current browser session; history derives fuel demand from saved distance and consumption.

## Project layout

```text
frontend/               React, TypeScript, Vite, React Router, Leaflet UI
  src/App.tsx           Navigation and routes
  src/Pages.tsx         Six application screens and local settings
  src/MapPanel.tsx      OpenStreetMap route display
  src/api.ts            Typed FastAPI client
backend/                Independent FastAPI application
  app/main.py           App, CORS, health checks
  app/api/routes.py     Application endpoints
  app/core/             SQL Server settings, engine, session provider
  app/services/data.py  Read existing SQL Server tables
  app/services/legacy.py
                        Adapt preserved root Python modules
  tests/               Offline checks
  .env.example          Backend configuration template
  requirements.txt      Backend runtime dependencies
app.py                  Preserved Streamlit PDF/price code
app_1.py                Preserved Streamlit truck registry code
app_2.py                Preserved Streamlit trip/routing code
api.py                  Preserved legacy FastAPI wrapper
Dockerfile, docker-compose.yml, DOCKER.md
                        Legacy API deployment on port 8501
```

The root `requirements.txt` and Docker files are for the older application. Install the new backend from `backend/requirements.txt`. The frontend has its own `package.json`. Generated maps, build output, virtual environments, and real `.env` files are ignored by Git.

## Prerequisites and configuration

- Python 3.10+ and Node.js 20.19+ or 22.12+ with npm.
- A reachable **existing** Microsoft SQL Server database, a SQL-authentication user with the needed permissions, and Microsoft ODBC Driver 17 or 18 for SQL Server installed on the backend computer. The driver name must match `DB_DRIVER` exactly.
- An OpenRouteService API key for route planning. The other screens and `/health` can start without it.

Copy `backend/.env.example` to `backend/.env` and set `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_DRIVER`, and `API_KEY`. The file is Git-ignored. Never commit real credentials. `DB_ENCRYPT=yes` and `DB_TRUST_SERVER_CERTIFICATE=no` are the defaults; for a local SQL Server with a self-signed certificate, `DB_TRUST_SERVER_CERTIFICATE=yes` can be used for development. Enable SQL Server TCP/IP and ensure the selected port is reachable. On Windows, ODBC Data Sources lists installed drivers.

The existing code expects a `Truck_Detail` or `Truck_Details` table with discoverable name, fuel-average, and tank-capacity columns; `LovesLocations` with `StoreNumber`, `City`, `Address`, `Latitude`, `Longitude`; `Discounted_Fuel_Price` with `Name`, `Your Price`, `Savings`; and `Trip_Records` with `Starting_point`, `Destination_point`, `Total_Distance`, `Truck_Name`, `Truck_Average_L`, `Required_Time`, `Date`. These are **source-code expectations**, not a verified live schema. No migration or sample data is supplied. If your actual database differs, inspect it before changing the queries.

## Run locally

Use two separate PowerShell terminals. In the first:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
# Edit .env with your own values before using database or route features.
python -m uvicorn app.main:app --reload --port 8000
```

If your terminal is at the repository root, use `python -m uvicorn app.main:app --app-dir backend --reload --port 8000` with the backend virtual environment activated. The root contains a different `app.py`, so `--app-dir backend` matters.

In the second terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Open the URL Vite prints, usually `http://localhost:5173`. If that port is occupied, Vite may use `5174`; both are in the default backend `CORS_ORIGINS`. For a different frontend origin, edit `CORS_ORIGINS` in `backend/.env` as a comma-separated list. `frontend/.env.example` shows the optional `VITE_API_BASE_URL` override; it defaults to `http://localhost:8000`.

In Visual Studio, choose **File → Open → Folder** and select the repository root to see both `frontend/` and `backend/`. Use a terminal rooted at `backend/` for the first command above. A `.sln` file is not required for Folder View.

## API and verification

`GET /health` checks that FastAPI is running. `GET /health/db` performs a read-only `SELECT 1`; it returns HTTP 503 when SQL Server is not configured or reachable. API documentation is at `http://localhost:8000/docs`.

The application endpoints are `GET /api/dashboard`, `GET/POST/PUT/DELETE /api/trucks`, `GET /api/fuel-prices`, `POST /api/fuel-prices/extract`, `POST /api/fuel-prices/approve`, `GET /api/stations`, `GET /api/trips`, and `POST /api/trips/plan`. PDF extraction previews rows without writing to the database; approval updates matching rows in one transaction and rolls back if a name does not match. It does not create price rows. The upload limit is 10 MB.

Run offline backend checks from `backend/`:

```powershell
python -m pip install -r requirements-dev.txt
python -m unittest discover -s tests -v
python -m app.core.database
```

The database probe prints `available` or `unavailable`; an unavailable result is expected without a configured SQL Server. From `frontend/`, run `npm run build` for the TypeScript and production build check. The offline tests mock external routing and database writes, and process the repository's sample PDF. A real SQL Server and OpenRouteService key are still needed to verify their live behavior.

The preserved root Docker configuration starts `api.py` on port 8501; it has not been switched to this frontend/backend application. See [DOCKER.md](DOCKER.md) if you need that legacy deployment.
