"""Read the existing SQL Server schema; create no tables or ORM models."""

from contextlib import closing
from typing import Any

from app.core.database import get_engine
from app.services.legacy import get_legacy


class DataUnavailable(Exception):
    """An expected table or column is absent from the existing database."""


def _quote(value: str) -> str:
    return "[" + value.replace("]", "]]") + "]"


def _table_ref(table: dict[str, Any]) -> str:
    return f"{_quote(table['schema'])}.{_quote(table['table'])}"


def _truck_table(cursor: Any) -> dict[str, Any]:
    _, trucks, _ = get_legacy()
    table = trucks._resolve_truck_table(cursor)
    if not table or not table["fuel_avg_col"] or not table["fuel_capacity_col"]:
        raise DataUnavailable("Truck table or required columns are missing")
    return table


def list_trucks() -> list[dict[str, Any]]:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        table = _truck_table(cursor)
        fields = [
            _quote(table["id_col"]) if table["id_col"] else "NULL",
            _quote(table["truck_name_col"]),
            _quote(table["fuel_avg_col"]),
            _quote(table["fuel_capacity_col"]),
        ]
        cursor.execute(f"SELECT {', '.join(fields)} FROM {_table_ref(table)} ORDER BY {fields[1]}")
        return [
            {
                "id": str(row[0]) if row[0] is not None else None,
                "name": str(row[1]).strip(),
                "fuel_average_l": float(row[2]),
                "tank_capacity_l": float(row[3]),
            }
            for row in cursor.fetchall()
            if row[1] is not None and row[2] is not None and row[3] is not None
        ]


def find_truck(name: str) -> dict[str, Any] | None:
    return next((truck for truck in list_trucks() if truck["name"].casefold() == name.strip().casefold()), None)


def update_truck(name: str, new_name: str, fuel_average_l: float, tank_capacity_l: float) -> bool:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        table = _truck_table(cursor)
        columns = (table["truck_name_col"], table["fuel_avg_col"], table["fuel_capacity_col"])
        cursor.execute(
            f"UPDATE {_table_ref(table)} SET {_quote(columns[0])}=?, {_quote(columns[1])}=?, "
            f"{_quote(columns[2])}=? WHERE LOWER(LTRIM(RTRIM(CAST({_quote(columns[0])} AS NVARCHAR(255)))))=LOWER(?)",
            (new_name.strip(), fuel_average_l, tank_capacity_l, name.strip()),
        )
        changed = cursor.rowcount > 0
        connection.commit()
        return changed


def list_stations(limit: int = 200) -> list[dict[str, Any]]:
    _, _, trips = get_legacy()
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        table = trips._resolve_table_reference(cursor, "LovesLocations")
        cursor.execute(
            f"SELECT TOP ({int(limit)}) [StoreNumber], [City], [Address], [Latitude], [Longitude] "
            f"FROM {table} WHERE [Latitude] IS NOT NULL AND [Longitude] IS NOT NULL ORDER BY [City], [Address]"
        )
        return [
            {
                "store_number": str(row[0]) if row[0] is not None else None,
                "city": str(row[1] or ""),
                "address": str(row[2] or ""),
                "latitude": float(row[3]),
                "longitude": float(row[4]),
            }
            for row in cursor.fetchall()
        ]


def list_prices(limit: int = 200) -> list[dict[str, Any]]:
    _, _, trips = get_legacy()
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        table = trips._resolve_table_reference(cursor, "Discounted_Fuel_Price")
        cursor.execute(
            f"SELECT TOP ({int(limit)}) [Name], [Your Price], [Savings] FROM {table} ORDER BY [Name]"
        )
        return [
            {
                "name": str(row[0] or ""),
                "your_price": str(row[1]) if row[1] is not None else None,
                "savings": str(row[2]) if row[2] is not None else None,
                "verified_at": None,
            }
            for row in cursor.fetchall()
        ]


def _trip_table(cursor: Any) -> str:
    _, _, trips = get_legacy()
    schema, table = trips._get_trip_records_table(cursor)
    if not schema or not table:
        raise DataUnavailable("Trip_Records table is missing")
    return f"{_quote(schema)}.{_quote(table)}"


def trip_count() -> int:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        cursor.execute(f"SELECT COUNT(*) FROM {_trip_table(cursor)}")
        return int(cursor.fetchone()[0])


def total_fuel_demand_l() -> float:
    """Estimate fuel from distance and truck average already saved in Trip_Records."""
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        cursor.execute(
            f"SELECT SUM(CAST([Total_Distance] AS FLOAT) * CAST([Truck_Average_L] AS FLOAT) / 100.0) "
            f"FROM {_trip_table(cursor)}"
        )
        return round(float(cursor.fetchone()[0] or 0), 2)


def list_trips(limit: int = 100) -> list[dict[str, Any]]:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        table = _trip_table(cursor)
        cursor.execute(
            f"SELECT TOP ({int(limit)}) [Starting_point], [Destination_point], [Total_Distance], "
            f"[Truck_Name], [Truck_Average_L], [Required_Time], [Date] FROM {table} ORDER BY [Date] DESC"
        )
        return [
            {
                "origin": str(row[0] or ""),
                "destination": str(row[1] or ""),
                "distance_km": float(row[2] or 0),
                "truck_name": str(row[3] or ""),
                "fuel_average_l": float(row[4] or 0),
                "fuel_required_l": round(float(row[2] or 0) * float(row[4] or 0) / 100, 2),
                "required_time": str(row[5] or ""),
                "date": row[6].isoformat() if hasattr(row[6], "isoformat") else str(row[6] or ""),
                "fuel_status": None,  # The existing table does not store this.
            }
            for row in cursor.fetchall()
        ]
