"""Offline checks for the Google Maps response adapter."""

import unittest
from unittest.mock import MagicMock, patch

from app.services import google_maps


class GoogleMapsAdapterTests(unittest.TestCase):
    def test_geocode_uses_v4_result_shape(self) -> None:
        response = MagicMock(ok=True)
        response.json.return_value = {"results": [{
            "location": {"latitude": 33.6844, "longitude": 73.0479},
            "formattedAddress": "Islamabad, Pakistan",
        }]}
        with patch.object(google_maps, "server_key", return_value="demo-key"), \
             patch.object(google_maps.requests, "get", return_value=response) as get:
            result = google_maps.geocode_address("Islamabad")
        self.assertTrue(result["success"])
        self.assertEqual(result["latitude"], 33.6844)
        self.assertEqual(result["label"], "Islamabad, Pakistan")
        self.assertIn("/v4/geocode/address/Islamabad", get.call_args.args[0])

    def test_route_decodes_geometry_and_distance(self) -> None:
        response = MagicMock(ok=True)
        response.json.return_value = {"routes": [{
            "distanceMeters": 2500,
            "duration": "420s",
            "polyline": {"encodedPolyline": "_p~iF~ps|U_ulLnnqC_mqNvxq`@"},
        }]}
        trips = MagicMock()
        trips.get_all_addresses_from_database.return_value = []
        trips._append_exact_endpoint_matches.return_value = []
        start = {"latitude": 38.5, "longitude": -120.2}
        end = {"latitude": 43.252, "longitude": -126.453}
        with patch.object(google_maps, "server_key", return_value="demo-key"), \
             patch.object(google_maps.requests, "post", return_value=response) as post:
            result = google_maps.calculate_route(start, end, trips)
        self.assertTrue(result["success"])
        self.assertEqual(result["distance_km"], 2.5)
        self.assertEqual(result["duration_seconds"], 420)
        self.assertEqual(len(result["route_coordinates"]), 3)
        self.assertEqual(result["route_coordinates"][0], {"lat": 38.5, "lon": -120.2})
        self.assertEqual(post.call_args.kwargs["json"]["travelMode"], "DRIVE")


if __name__ == "__main__":
    unittest.main()
