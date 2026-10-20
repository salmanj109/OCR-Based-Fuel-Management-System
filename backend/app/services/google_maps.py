"""Google Maps Platform adapter for the React trip planner."""

import os
import re
from urllib.parse import quote

import requests


GEOCODE_URL = "https://geocode.googleapis.com/v4/geocode/address/"
ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes"


def server_key() -> str:
    return os.getenv("GOOGLE_MAPS_API_KEY", "").strip()


def browser_key() -> str:
    # A single demo key can be used during prototyping. Use separate restricted
    # server and browser keys when switching to a billed production project.
    return os.getenv("GOOGLE_MAPS_BROWSER_KEY", "").strip() or server_key()


def _request_error(response: requests.Response, action: str) -> str:
    if response.status_code in (401, 403):
        return f"Google Maps {action} rejected the key. Check demo key access and API restrictions."
    if response.status_code == 429:
        return f"Google Maps demo quota reached for {action}. Try again after the daily reset."
    return f"Google Maps {action} failed (HTTP {response.status_code})."


def geocode_address(address: str) -> dict:
    """Convert an entered address or city to coordinates via Geocoding v4."""
    query = address.strip()
    if not query:
        return {"success": False, "error": "Location text is required."}
    try:
        response = requests.get(
            GEOCODE_URL + quote(query, safe=""),
            headers={
                "X-Goog-Api-Key": server_key(),
                "X-Goog-FieldMask": "results.location,results.formattedAddress",
            },
            timeout=10,
        )
        if not response.ok:
            return {"success": False, "error": _request_error(response, "geocoding")}
        results = response.json().get("results") or []
        if not results:
            return {"success": False, "error": f'Location "{query}" was not found.'}
        location = results[0].get("location") or {}
        return {
            "success": True,
            "latitude": float(location["latitude"]),
            "longitude": float(location["longitude"]),
            "label": results[0].get("formattedAddress") or query,
        }
    except (requests.exceptions.RequestException, ValueError, KeyError, TypeError):
        return {"success": False, "error": "Google Maps geocoding is unavailable or returned an invalid location."}


def _decode_polyline(encoded: str) -> list[tuple[float, float]]:
    """Decode Google's standard precision-5 encoded route polyline."""
    points = []
    latitude = longitude = index = 0
    while index < len(encoded):
        deltas = []
        for _ in range(2):
            shift = value = 0
            while True:
                if index >= len(encoded):
                    raise ValueError("Incomplete route polyline")
                chunk = ord(encoded[index]) - 63
                index += 1
                value |= (chunk & 0x1f) << shift
                if chunk < 0x20:
                    break
                shift += 5
            deltas.append(~(value >> 1) if value & 1 else value >> 1)
        latitude += deltas[0]
        longitude += deltas[1]
        points.append((latitude / 1e5, longitude / 1e5))
    return points


def calculate_route(start: dict, end: dict, trips) -> dict:
    """Compute a driving route and adapt it for the existing fuel planner."""
    payload = {
        "origin": {"location": {"latLng": {"latitude": start["latitude"], "longitude": start["longitude"]}}},
        "destination": {"location": {"latLng": {"latitude": end["latitude"], "longitude": end["longitude"]}}},
        "travelMode": "DRIVE",
        "computeAlternativeRoutes": False,
        "polylineQuality": "HIGH_QUALITY",
    }
    try:
        response = requests.post(
            ROUTES_URL,
            json=payload,
            headers={
                "Content-Type": "application/json",
                "X-Goog-Api-Key": server_key(),
                "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
            },
            timeout=15,
        )
        if not response.ok:
            return {"success": False, "error": _request_error(response, "routing")}
        routes = response.json().get("routes") or []
        if not routes:
            return {"success": False, "error": "Google Maps found no driving route between these locations."}
        route = routes[0]
        distance_km = float(route["distanceMeters"]) / 1000
        duration = route["duration"]
        duration_seconds = float(re.fullmatch(r"([0-9]+(?:\.[0-9]+)?)s", duration).group(1))
        coordinates = _decode_polyline(route["polyline"]["encodedPolyline"])
        if not coordinates:
            return {"success": False, "error": "Google Maps returned a route without map geometry."}

        bounds = trips._route_bounding_box(coordinates, margin_km=15)
        all_addresses = trips.get_all_addresses_from_database(bounds)
        along_route = []
        for address in all_addresses:
            proximity = trips._find_nearest_point_on_route(
                address["latitude"], address["longitude"], coordinates
            )
            if proximity and proximity["distance_to_route_km"] <= 10:
                along_route.append({
                    "store_number": address.get("store_number"),
                    "city": address["city"],
                    "address": address["address"],
                    "latitude": address["latitude"],
                    "longitude": address["longitude"],
                    "distance_from_start_km": round(trips._haversine_distance(
                        start["latitude"], start["longitude"],
                        address["latitude"], address["longitude"]
                    ), 2),
                    "distance_from_route_km": proximity["distance_to_route_km"],
                    "distance_along_route_km": proximity["distance_along_route_km"],
                })
        along_route = trips._append_exact_endpoint_matches(
            along_route, all_addresses,
            start["latitude"], start["longitude"], end["latitude"], end["longitude"]
        )
        along_route.sort(key=trips._route_position_km)
        return {
            "success": True,
            "distance_km": round(distance_km, 2),
            "duration_seconds": duration_seconds,
            "route_coordinates": [
                {"lat": round(lat, 6), "lon": round(lon, 6)} for lat, lon in coordinates
            ],
            "addresses_along_route": along_route,
        }
    except (requests.exceptions.RequestException, ValueError, KeyError, TypeError, AttributeError):
        return {"success": False, "error": "Google Maps routing is unavailable or returned an invalid route."}
