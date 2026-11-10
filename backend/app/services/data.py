"""Read the existing SQL Server schema; create no tables or ORM models."""

from contextlib import closing
import json
from datetime import date, timedelta
from typing import Any

from app.core.database import get_engine
from app.services.legacy import get_legacy


class DataUnavailable(Exception):
    """An expected table or column is absent from the existing database."""


def _quote(value: str) -> str:
    return "[" + value.replace("]", "]]") + "]"


def _table_ref(table: dict[str, Any]) -> str:
    return f"{_quote(table['schema'])}.{_quote(table['table'])}"


def _columns(cursor: Any, table: dict[str, Any]) -> dict[str, str]:
    return {
        str(row.column_name).casefold(): str(row.column_name)
        for row in cursor.columns(table=table["table"], schema=table["schema"])
    }


def _optional_column(columns: dict[str, str], *names: str) -> str:
    return next((columns[name.casefold()] for name in names if name.casefold() in columns), "")


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
        columns = _columns(cursor, table)
        fields = [
            _quote(table["id_col"]) if table["id_col"] else "NULL",
            _quote(table["truck_name_col"]),
            _quote(table["fuel_avg_col"]),
            _quote(table["fuel_capacity_col"]),
            _quote(_optional_column(columns, "Registration_Number", "RegistrationNumber")) if _optional_column(columns, "Registration_Number", "RegistrationNumber") else "NULL",
            _quote(_optional_column(columns, "Vehicle_Type", "VehicleType")) if _optional_column(columns, "Vehicle_Type", "VehicleType") else "N'Truck'",
            _quote(_optional_column(columns, "Fuel_Type", "FuelType")) if _optional_column(columns, "Fuel_Type", "FuelType") else "N'Diesel'",
            _quote(_optional_column(columns, "Status")) if _optional_column(columns, "Status") else "N'Active'",
        ]
        cursor.execute(f"SELECT {', '.join(fields)} FROM {_table_ref(table)} ORDER BY {fields[1]}")
        return [
            {
                "id": str(row[0]) if row[0] is not None else None,
                "name": str(row[1]).strip(),
                "fuel_average_l": float(row[2]),
                "tank_capacity_l": float(row[3]),
                "registration_number": str(row[4]).strip() if row[4] is not None else "",
                "vehicle_type": str(row[5] or "Truck").strip(),
                "fuel_type": str(row[6] or "Diesel").strip(),
                "status": str(row[7] or "Active").strip(),
            }
            for row in cursor.fetchall()
            if row[1] is not None and row[2] is not None and row[3] is not None
        ]


def find_truck(name: str) -> dict[str, Any] | None:
    return next((truck for truck in list_trucks() if truck["name"].casefold() == name.strip().casefold()), None)


def update_truck(
    name: str,
    new_name: str,
    fuel_average_l: float,
    tank_capacity_l: float,
    registration_number: str = "",
    vehicle_type: str = "Truck",
    fuel_type: str = "Diesel",
    status: str = "Active",
) -> bool:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        table = _truck_table(cursor)
        column_map = _columns(cursor, table)
        fields = [table["truck_name_col"], table["fuel_avg_col"], table["fuel_capacity_col"]]
        values: list[Any] = [new_name.strip(), fuel_average_l, tank_capacity_l]
        for names, value in [
            (("Registration_Number", "RegistrationNumber"), registration_number.strip()),
            (("Vehicle_Type", "VehicleType"), vehicle_type.strip()),
            (("Fuel_Type", "FuelType"), fuel_type.strip()),
            (("Status",), status.strip()),
        ]:
            field = _optional_column(column_map, *names)
            if field:
                fields.append(field)
                values.append(value)
        cursor.execute(
            f"UPDATE {_table_ref(table)} SET {', '.join(f'{_quote(field)}=?' for field in fields)} "
            f"WHERE LOWER(LTRIM(RTRIM(CAST({_quote(table['truck_name_col'])} AS NVARCHAR(255)))))=LOWER(?)",
            (*values, name.strip()),
        )
        changed = cursor.rowcount > 0
        connection.commit()
        return changed


def _driver(row: Any) -> dict[str, Any]:
    return {
        "id": int(row[0]), "name": str(row[1]).strip(), "phone": str(row[2]).strip(),
        "email": str(row[3] or ""), "national_id": str(row[4] or ""),
        "license_number": str(row[5]).strip(),
        "license_expiry_date": row[6].isoformat() if hasattr(row[6], "isoformat") else (str(row[6]) if row[6] else None),
        "assigned_vehicle_name": str(row[7]) if row[7] else None,
        "address": str(row[8] or ""), "status": str(row[9] or "Active"),
    }


def list_drivers() -> list[dict[str, Any]]:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        cursor.execute(
            "SELECT [Id], [Name], [Phone], [Email], [NationalId], [LicenseNumber], "
            "[LicenseExpiryDate], [AssignedVehicleName], [Address], [Status] "
            "FROM dbo.Drivers ORDER BY [Name]"
        )
        return [_driver(row) for row in cursor.fetchall()]


def get_driver(driver_id: int) -> dict[str, Any] | None:
    return next((driver for driver in list_drivers() if driver["id"] == driver_id), None)


def save_driver(driver_id: int | None, payload: dict[str, Any]) -> dict[str, Any]:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        values = (
            payload["name"].strip(), payload["phone"].strip(), payload.get("email", "").strip() or None,
            payload.get("national_id", "").strip() or None, payload["license_number"].strip(),
            payload.get("license_expiry_date") or None, payload.get("assigned_vehicle_name") or None,
            payload.get("address", "").strip() or None, payload.get("status", "Active"),
        )
        if driver_id is None:
            cursor.execute(
                "INSERT INTO dbo.Drivers ([Name], [Phone], [Email], [NationalId], [LicenseNumber], "
                "[LicenseExpiryDate], [AssignedVehicleName], [Address], [Status]) "
                "OUTPUT INSERTED.[Id] VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", values,
            )
            saved_id = int(cursor.fetchone()[0])
        else:
            cursor.execute(
                "UPDATE dbo.Drivers SET [Name]=?, [Phone]=?, [Email]=?, [NationalId]=?, "
                "[LicenseNumber]=?, [LicenseExpiryDate]=?, [AssignedVehicleName]=?, [Address]=?, [Status]=? "
                "WHERE [Id]=?", (*values, driver_id),
            )
            if cursor.rowcount == 0:
                connection.rollback()
                raise LookupError("Driver not found")
            saved_id = driver_id
        connection.commit()
    saved = get_driver(saved_id)
    if saved is None:
        raise DataUnavailable("Saved driver could not be read")
    return saved


def delete_driver(driver_id: int) -> bool:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        cursor.execute("DELETE FROM dbo.Drivers WHERE [Id]=?", driver_id)
        deleted = cursor.rowcount > 0
        connection.commit()
        return deleted


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
        columns = {name.casefold() for name in _columns(cursor, {"schema": "dbo", "table": "Discounted_Fuel_Price"})}
        effective = "[EffectiveDate]" if "effectivedate" in columns else "NULL"
        cursor.execute(f"SELECT TOP ({int(limit)}) [Name], [Your Price], [Savings], {effective} FROM {table} ORDER BY [Name]")
        return [
            {
                "name": str(row[0] or ""),
                "your_price": str(row[1]) if row[1] is not None else None,
                "savings": str(row[2]) if row[2] is not None else None,
                "verified_at": row[3].isoformat() if row[3] else None,
            }
            for row in cursor.fetchall()
        ]


def save_prices(rows: list[Any], supplier: str = "") -> int:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        columns = _columns(cursor, {"schema": "dbo", "table": "Discounted_Fuel_Price"})
        count = 0
        for row in rows:
            price, saving = float(row.your_price), float(row.saving)
            if price <= 0 or saving < 0:
                raise ValueError("Prices must be positive and savings nonnegative")
            fields = {"Your Price": price, "Savings": saving}
            if "effectivedate" in columns:
                fields[columns["effectivedate"]] = row.effective_date
            if "suppliername" in columns:
                fields[columns["suppliername"]] = supplier.strip() or None
            assignments = ", ".join(f"{_quote(key)}=?" for key in fields)
            cursor.execute(f"UPDATE dbo.Discounted_Fuel_Price SET {assignments} WHERE [Name]=?", (*fields.values(), row.name.strip()))
            if cursor.rowcount == 0:
                names = ["Name", *fields]
                cursor.execute(f"INSERT INTO dbo.Discounted_Fuel_Price ({', '.join(_quote(n) for n in names)}) VALUES ({', '.join('?' for _ in names)})", (row.name.strip(), *fields.values()))
            count += 1
        connection.commit()
        return count


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


def list_trips(limit: int = 10000, driver_id: int | None = None) -> list[dict[str, Any]]:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        table = _trip_table(cursor)
        schema, name = table.replace("[", "").replace("]", "").split(".")
        columns = _columns(cursor, {"schema": schema, "table": name})
        if driver_id is not None and "driver_id" not in columns:
            return []
        optional = ["Id", "Current_Fuel_L", "Fuel_Status", "Driver_Id", "Reserve_Km", "Route_Geometry", "Recommended_Stops"]
        extras = [f"{_quote(columns[key.casefold()])}" if key.casefold() in columns else "NULL" for key in optional]
        restriction = " WHERE [Driver_Id] = ?" if driver_id is not None else ""
        cursor.execute(f"SELECT TOP ({int(limit)}) [Starting_point], [Destination_point], [Total_Distance], [Truck_Name], [Truck_Average_L], [Required_Time], [Date], {', '.join(extras)} FROM {table}{restriction} ORDER BY [Date] DESC", *((driver_id,) if driver_id is not None else ()))
        drivers = {driver["id"]: driver["name"] for driver in list_drivers() if driver_id is None or driver["id"] == driver_id}
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
                "id": str(row[7]) if row[7] is not None else None,
                "current_fuel_l": float(row[8]) if row[8] is not None else None,
                "fuel_status": str(row[9]) if row[9] is not None else None,
                "driver_id": row[10], "driver_name": drivers.get(row[10]),
                "reserve_km": float(row[11]) if row[11] is not None else None,
                "route_coordinates": json.loads(row[12]) if row[12] else [],
                "recommended_stops": json.loads(row[13]) if row[13] else [],
            }
            for row in cursor.fetchall()
        ]


def save_trip(payload: dict[str, Any], truck: dict[str, Any]) -> dict[str, Any]:
    with closing(get_engine().raw_connection()) as connection:
        cursor = connection.cursor()
        table = _trip_table(cursor)
        schema, name = table.replace("[", "").replace("]", "").split(".")
        columns = _columns(cursor, {"schema": schema, "table": name})
        if "id" in columns and "current_fuel_l" in columns:
            cursor.execute(
                f"SELECT TOP (1) [Id] FROM {table} WITH (UPDLOCK, HOLDLOCK) "
                "WHERE [Starting_point]=? AND [Destination_point]=? AND [Truck_Name]=? "
                "AND [Date]=? AND [Current_Fuel_L]=? AND [Total_Distance]=? ORDER BY [Id] DESC",
                (payload["origin"].strip(), payload["destination"].strip(), truck["name"],
                 date.today(), payload["current_fuel_l"], payload["distance_km"]),
            )
            existing = cursor.fetchone()
            if existing:
                connection.commit()
                return {"trip_record_id": str(existing[0]), "already_saved": True}
        fields = {"Starting_point": payload["origin"].strip(), "Destination_point": payload["destination"].strip(),
                  "Total_Distance": payload["distance_km"], "Truck_Name": truck["name"],
                  "Truck_Average_L": truck["fuel_average_l"],
                  "Required_Time": str(timedelta(seconds=int(payload["duration_seconds"]))) if payload["duration_seconds"] < 86400 else "23:59:59",
                  "Date": date.today()}
        extras = {"Current_Fuel_L": payload["current_fuel_l"], "Fuel_Status": payload["fuel_status"],
                  "Driver_Id": payload.get("driver_id"), "Reserve_Km": payload["reserve_km"],
                  "Route_Geometry": json.dumps(payload["route_coordinates"]),
                  "Recommended_Stops": json.dumps(payload["recommended_stops"])}
        for key, value in extras.items():
            if key.casefold() in columns:
                fields[columns[key.casefold()]] = value
        names = list(fields)
        output = "OUTPUT INSERTED.[Id]" if "id" in columns else ""
        cursor.execute(f"INSERT INTO {table} ({', '.join(_quote(n) for n in names)}) {output} VALUES ({', '.join('?' for _ in names)})", tuple(fields.values()))
        record_id = cursor.fetchone()[0] if output else None
        connection.commit()
        return {"trip_record_id": str(record_id) if record_id is not None else None}
