"""API endpoints backed by the preserved project implementation."""

import logging
import tempfile
from pathlib import Path

import pandas as pd
import pyodbc
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import DatabaseConfigurationError
from app.services import data
from app.services.legacy import get_legacy


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api")
MAX_PDF_BYTES = 10 * 1024 * 1024


class TruckInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    fuel_average_l: float = Field(gt=0)
    tank_capacity_l: float = Field(gt=0)


class TripInput(BaseModel):
    origin: str = Field(min_length=1, max_length=250)
    destination: str = Field(min_length=1, max_length=250)
    truck_name: str = Field(min_length=1, max_length=120)
    current_fuel_l: float = Field(ge=0)
    reserve_km: float = Field(default=20, ge=0, le=1000)


class PriceRow(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    your_price: str = Field(min_length=1, max_length=50)
    saving: str = Field(min_length=1, max_length=50)


class PriceApproval(BaseModel):
    rows: list[PriceRow] = Field(min_length=1, max_length=5000)


def _database_unavailable(error: Exception) -> HTTPException:
    logger.warning("Database operation unavailable: %s", type(error).__name__)
    return HTTPException(status_code=503, detail="Database is unavailable or its expected schema is missing")


DB_ERRORS = (DatabaseConfigurationError, SQLAlchemyError, pyodbc.Error, data.DataUnavailable)


@router.get("/dashboard")
def dashboard() -> dict:
    try:
        trucks = data.list_trucks()
        return {
            "truck_count": len(trucks),
            "planned_trip_count": data.trip_count(),
            "estimated_fuel_demand_l": data.total_fuel_demand_l(),
            "recent_trips": data.list_trips(5),
        }
    except DB_ERRORS as error:
        raise _database_unavailable(error) from error


@router.get("/trucks")
def trucks() -> list[dict]:
    try:
        return data.list_trucks()
    except DB_ERRORS as error:
        raise _database_unavailable(error) from error


@router.post("/trucks", status_code=201)
def add_truck(payload: TruckInput) -> dict:
    _, registry, _ = get_legacy()
    result = registry.add_truck_to_db(
        payload.name.strip(), payload.fuel_average_l, payload.tank_capacity_l
    )
    if not result.get("success"):
        error = str(result.get("error", ""))
        if "already exists" in error:
            raise HTTPException(status_code=409, detail="A truck with this name already exists")
        raise HTTPException(status_code=503, detail="Truck could not be saved to the database")
    return {"id": result["id"], "name": result["truck_name"]}


@router.put("/trucks/{truck_name}")
def edit_truck(truck_name: str, payload: TruckInput) -> dict:
    try:
        if payload.name.strip().casefold() != truck_name.strip().casefold() and data.find_truck(payload.name):
            raise HTTPException(status_code=409, detail="A truck with this name already exists")
        changed = data.update_truck(
            truck_name, payload.name, payload.fuel_average_l, payload.tank_capacity_l
        )
    except DB_ERRORS as error:
        raise _database_unavailable(error) from error
    if not changed:
        raise HTTPException(status_code=404, detail="Truck not found")
    return {"name": payload.name.strip(), "updated": True}


@router.delete("/trucks/{truck_name}")
def delete_truck(truck_name: str) -> dict:
    _, registry, _ = get_legacy()
    result = registry.delete_truck_from_db(truck_name)
    if not result.get("success"):
        if "not found" in str(result.get("error", "")).lower():
            raise HTTPException(status_code=404, detail="Truck not found")
        raise HTTPException(status_code=503, detail="Truck could not be deleted from the database")
    return {"deleted": True}


@router.get("/fuel-prices")
def fuel_prices() -> dict:
    try:
        return {"rows": data.list_prices(), "price_freshness": "unverified"}
    except DB_ERRORS as error:
        raise _database_unavailable(error) from error


@router.post("/fuel-prices/extract")
async def extract_prices(file: UploadFile = File(...)) -> dict:
    if Path(file.filename or "").suffix.lower() != ".pdf":
        raise HTTPException(status_code=422, detail="Upload a .pdf file")
    content = await file.read(MAX_PDF_BYTES + 1)
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(status_code=413, detail="PDF must be 10 MB or smaller")
    if not content.startswith(b"%PDF-"):
        raise HTTPException(status_code=422, detail="File is not a readable PDF")

    pdf, _, _ = get_legacy()
    with tempfile.TemporaryDirectory() as temp_dir:
        path = Path(temp_dir) / "upload.pdf"
        path.write_bytes(content)
        try:
            # The original parser's sample-price fallback is disabled here.
            frame = pdf.process_pdf_to_dataframe(path, use_demo_prices=False)
        except Exception as error:
            logger.info("PDF extraction failed: %s", type(error).__name__)
            raise HTTPException(status_code=422, detail="No supported pricing rows could be extracted") from error

    rows = frame.fillna("").to_dict(orient="records")
    return {"rows": rows, "source": "PDF text extraction", "ocr_used": False}


@router.post("/fuel-prices/approve")
def approve_prices(payload: PriceApproval) -> dict:
    pdf, _, _ = get_legacy()
    frame = pd.DataFrame(
        [
            {"Name": row.name.strip(), "Your Price": row.your_price.strip(), "Saving": row.saving.strip()}
            for row in payload.rows
        ]
    )
    try:
        count = pdf.update_discounted_fuel_prices(frame)
    except Exception as error:
        logger.warning("Approved prices could not be saved: %s", type(error).__name__)
        raise HTTPException(status_code=503, detail="Approved prices could not be saved; check matching database rows") from error
    return {"updated_count": count}


@router.get("/stations")
def stations() -> dict:
    try:
        return {"rows": data.list_stations(), "price_freshness": "unverified"}
    except DB_ERRORS as error:
        raise _database_unavailable(error) from error


@router.get("/trips")
def trip_history() -> dict:
    try:
        return {"rows": data.list_trips(), "count": data.trip_count()}
    except DB_ERRORS as error:
        raise _database_unavailable(error) from error


@router.post("/trips/plan", status_code=201)
def plan_trip(payload: TripInput) -> dict:
    try:
        truck = data.find_truck(payload.truck_name)
    except DB_ERRORS as error:
        raise _database_unavailable(error) from error
    if truck is None:
        raise HTTPException(status_code=404, detail="Selected truck was not found")
    if payload.current_fuel_l > truck["tank_capacity_l"]:
        raise HTTPException(status_code=422, detail="Current fuel exceeds this truck's tank capacity")

    _, _, trips = get_legacy()
    if not trips.API_KEY:
        raise HTTPException(status_code=503, detail="OpenRouteService API key is not configured")

    start = trips.resolve_location_to_coordinates(payload.origin.strip())
    end = trips.resolve_location_to_coordinates(payload.destination.strip())
    if not start.get("success") or not end.get("success"):
        raise HTTPException(status_code=422, detail="Origin or destination could not be resolved")
    route = trips.calculate_distance_with_api(
        start["latitude"], start["longitude"], end["latitude"], end["longitude"]
    )
    if not route.get("success"):
        raise HTTPException(status_code=502, detail="Routing service could not calculate this trip")

    fuel = trips._build_fuel_management_summary(
        route.get("addresses_along_route", []),
        route["distance_km"],
        payload.current_fuel_l,
        truck["fuel_average_l"],
        tank_capacity_l=truck["tank_capacity_l"],
        reserve_buffer_km=payload.reserve_km,
    )
    saved = trips.store_trip_record(
        starting_point=payload.origin.strip(),
        destination_point=payload.destination.strip(),
        total_distance_km=route["distance_km"],
        truck_name=truck["name"],
        truck_average_l=truck["fuel_average_l"],
        required_time_seconds=route["duration_seconds"],
    )
    if not saved.get("success"):
        raise HTTPException(status_code=503, detail="Trip could not be saved to the database")

    return {
        "trip_record_id": str(saved.get("record_id")) if saved.get("record_id") is not None else None,
        "truck": truck,
        "origin": start.get("label") or payload.origin,
        "destination": end.get("label") or payload.destination,
        "distance_km": route["distance_km"],
        "duration_seconds": route["duration_seconds"],
        "route_coordinates": route.get("route_coordinates", []),
        "fuel_required_l": round(route["distance_km"] * truck["fuel_average_l"] / 100, 2),
        "current_fuel_l": payload.current_fuel_l,
        "reserve_km": payload.reserve_km,
        "safe_operating_range_km": fuel["safe_operating_range_km"],
        "fuel_status": fuel["fuel_status"],
        "fuel_status_message": fuel["fuel_status_message"],
        "recommended_stops": fuel.get("recommended_fueling_points", []),
        "safety_failure": fuel.get("safety_failure"),
        "station_prices": "unverified",
    }
