"""Boundary checks for the preserved planner with per-trip truck settings."""

import unittest
from unittest.mock import patch

from app.services.legacy import get_legacy


class FuelRuleTests(unittest.TestCase):
    def test_required_fuel_uses_litres_per_100_km(self) -> None:
        _, _, trips = get_legacy()
        self.assertEqual(trips._fuel_required_l_for_distance(250, 32), 80)

    def test_safe_range_respects_capacity_and_reserve(self) -> None:
        _, _, trips = get_legacy()
        with patch.object(trips, "_attach_savings_to_route_stations", side_effect=lambda points: points):
            at_limit = trips._build_fuel_management_summary([], 170, 40, 20, tank_capacity_l=100, reserve_buffer_km=30)
            over_limit = trips._build_fuel_management_summary([], 171, 40, 20, tank_capacity_l=100, reserve_buffer_km=30)
        self.assertEqual(at_limit["safe_operating_range_km"], 170)
        self.assertEqual(at_limit["half_tank_l"], 50)
        self.assertEqual(at_limit["fuel_status"], "Sufficient")
        self.assertEqual(over_limit["fuel_status"], "Insufficient")
        self.assertIsNotNone(over_limit["safety_failure"])


if __name__ == "__main__":
    unittest.main()
