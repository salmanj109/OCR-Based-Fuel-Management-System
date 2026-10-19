"""API checks that do not need SQL Server or an OpenRouteService key."""

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pandas as pd
from fastapi.testclient import TestClient

from app.main import app
from app.services.legacy import get_legacy


client = TestClient(app)


class ApiTests(unittest.TestCase):
    def test_health_is_independent_of_database(self) -> None:
        response = client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_trip_rejects_more_fuel_than_truck_capacity(self) -> None:
        truck = {"id": "T1", "name": "Truck 1", "fuel_average_l": 30, "tank_capacity_l": 100}
        with patch("app.api.routes.data.find_truck", return_value=truck):
            response = client.post("/api/trips/plan", json={
                "origin": "Calgary", "destination": "Edmonton", "truck_name": "Truck 1",
                "current_fuel_l": 101, "reserve_km": 20,
            })
        self.assertEqual(response.status_code, 422)

    def test_trip_uses_actual_capacity_and_explicit_reserve(self) -> None:
        truck = {"id": "T1", "name": "Truck 1", "fuel_average_l": 30, "tank_capacity_l": 100}
        routing = SimpleNamespace(
            API_KEY="test-key",
            resolve_location_to_coordinates=lambda name: {
                "success": True, "latitude": 51.0, "longitude": -114.0, "label": name,
            },
            calculate_distance_with_api=lambda *_: {
                "success": True, "distance_km": 250, "duration_seconds": 10800,
                "route_coordinates": [], "addresses_along_route": [],
            },
            store_trip_record=lambda **_: {"success": True, "record_id": 7},
        )
        fuel = {
            "safe_operating_range_km": 180, "fuel_status": "Insufficient",
            "fuel_status_message": "Refuel required", "recommended_fueling_points": [],
            "safety_failure": None,
        }
        with patch("app.api.routes.data.find_truck", return_value=truck), \
             patch("app.api.routes.get_legacy", return_value=(None, None, routing)), \
             patch.object(routing, "_build_fuel_management_summary", return_value=fuel, create=True) as planner:
            response = client.post("/api/trips/plan", json={
                "origin": "Calgary", "destination": "Edmonton", "truck_name": "Truck 1",
                "current_fuel_l": 70, "reserve_km": 35,
            })
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["fuel_required_l"], 75)
        self.assertEqual(response.json()["trip_record_id"], "7")
        self.assertEqual(planner.call_args.kwargs["tank_capacity_l"], 100)
        self.assertEqual(planner.call_args.kwargs["reserve_buffer_km"], 35)

    def test_pdf_rejects_non_pdf_content(self) -> None:
        response = client.post("/api/fuel-prices/extract", files={
            "file": ("prices.pdf", b"not a PDF", "application/pdf"),
        })
        self.assertEqual(response.status_code, 422)

    def test_existing_pdf_extracts_without_saving(self) -> None:
        path = Path(__file__).resolve().parents[2] / "pcn-usd-8467454-4338.pdf"
        with path.open("rb") as source:
            response = client.post("/api/fuel-prices/extract", files={
                "file": (path.name, source, "application/pdf"),
            })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["rows"]), 598)
        self.assertFalse(response.json()["ocr_used"])

    def test_unmatched_price_updates_roll_back(self) -> None:
        pdf, _, _ = get_legacy()
        connection = MagicMock()
        connection.cursor.return_value.rowcount = 0
        frame = pd.DataFrame([{"Name": "Unknown", "Your Price": "1.25", "Saving": "0.10"}])
        with patch.object(pdf, "get_db_connection", return_value=connection):
            with self.assertRaises(pdf.DatabaseUpdateError):
                pdf.update_discounted_fuel_prices(frame)
        connection.rollback.assert_called_once()
        connection.commit.assert_not_called()

    def test_new_price_name_can_be_inserted_after_approval(self) -> None:
        pdf, _, _ = get_legacy()
        connection = MagicMock()
        connection.cursor.return_value.rowcount = 0
        frame = pd.DataFrame([{"Name": "101", "Your Price": "1.25", "Saving": "0.10"}])
        with patch.object(pdf, "get_db_connection", return_value=connection):
            saved = pdf.update_discounted_fuel_prices(frame, insert_missing=True)
        self.assertEqual(saved, 1)
        self.assertEqual(connection.cursor.return_value.execute.call_count, 2)
        connection.commit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
