"""Fleet operations backed by the existing SQL Server entities."""
from contextlib import closing
from datetime import date
from app.core.database import get_engine


def stations():
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        c.execute("SELECT l.[StoreNumber], l.[StationName], l.[Address], l.[City], l.[Latitude], l.[Longitude], l.[ContactNumber], l.[FuelTypes], l.[DieselPrice], l.[PetrolPrice], l.[Status], p.[Your Price], p.[Savings] FROM dbo.LovesLocations l LEFT JOIN dbo.Discounted_Fuel_Price p ON p.[Name]=l.[StoreNumber] ORDER BY l.[City],l.[Address]")
        return [dict(store_number=str(r[0]), name=r[1] or str(r[0]), address=r[2], city=r[3], latitude=float(r[4]), longitude=float(r[5]), contact_number=r[6] or '', fuel_types=r[7] or '', diesel_price=float(r[8]) if r[8] is not None else None, petrol_price=float(r[9]) if r[9] is not None else None, status=r[10], recorded_price=float(r[11]) if r[11] is not None else None, saving=float(r[12]) if r[12] is not None else None) for r in c.fetchall()]


def save_station(payload, previous=None):
    fields = (payload.name, payload.address, payload.city, payload.latitude, payload.longitude, payload.contact_number or None, ', '.join(payload.fuel_types), payload.diesel_price, payload.petrol_price, payload.status)
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        try:
            if previous is None:
                c.execute("INSERT INTO dbo.LovesLocations ([StoreNumber],[StationName],[Address],[City],[Latitude],[Longitude],[ContactNumber],[FuelTypes],[DieselPrice],[PetrolPrice],[Status]) VALUES (?,?,?,?,?,?,?,?,?,?,?)", payload.store_number, *fields)
            else:
                c.execute("UPDATE dbo.LovesLocations SET [StoreNumber]=?,[StationName]=?,[Address]=?,[City]=?,[Latitude]=?,[Longitude]=?,[ContactNumber]=?,[FuelTypes]=?,[DieselPrice]=?,[PetrolPrice]=?,[Status]=? WHERE [StoreNumber]=?", payload.store_number, *fields, previous)
                if not c.rowcount:
                    raise LookupError('Station not found')
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return next(s for s in stations() if s['store_number'] == payload.store_number)


def delete_station(code):
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        c.execute('DELETE FROM dbo.LovesLocations WHERE [StoreNumber]=?', code)
        changed = c.rowcount > 0
        conn.commit()
        return changed


def create_alert(category, priority, title, message, key, driver_id=None):
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        # The filtered unique index makes simultaneous duplicate events safe.
        c.execute("IF NOT EXISTS (SELECT 1 FROM dbo.FleetAlerts WITH (UPDLOCK, HOLDLOCK) WHERE [EventKey]=? AND [ResolvedAt] IS NULL) INSERT INTO dbo.FleetAlerts ([Category],[Priority],[Title],[Message],[EventKey],[DriverId]) VALUES (?,?,?,?,?,?)", key, category, priority, title, message, key, driver_id)
        conn.commit()


def alerts(driver_id=None):
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        where = ' WHERE [DriverId]=?' if driver_id is not None else ''
        c.execute(f'SELECT TOP (500) [Id],[Category],[Priority],[Title],[Message],[DriverId],[CreatedAt],[ReadAt],[ResolvedAt] FROM dbo.FleetAlerts{where} ORDER BY [CreatedAt] DESC', *((driver_id,) if driver_id is not None else ()))
        return [dict(id=r[0], category=r[1], priority=r[2], title=r[3], message=r[4], driver_id=r[5], created_at=r[6].isoformat(), is_read=r[7] is not None, is_resolved=r[8] is not None) for r in c.fetchall()]


def update_alert(alert_id, action, driver_id=None, category=None):
    column = '[ReadAt]' if action == 'read' else '[ResolvedAt]'
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        restriction = ' AND [DriverId]=?' if driver_id is not None else ''
        restriction += ' AND [Category]=?' if category else ''
        c.execute(f'UPDATE dbo.FleetAlerts SET {column}=COALESCE({column},SYSUTCDATETIME()) WHERE [Id]=?{restriction}', alert_id, *((driver_id,) if driver_id is not None else ()), *((category,) if category else ()))
        changed = c.rowcount > 0
        conn.commit()
        return changed


def preferences(user_id):
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        c.execute('SELECT [LicenseExpiryDays],[NotifyInApp] FROM dbo.AlertPreferences WHERE [UserId]=?', user_id)
        row = c.fetchone()
        return {'license_expiry_days': row[0], 'notify_in_app': bool(row[1])} if row else {'license_expiry_days': 30, 'notify_in_app': True}


def save_preferences(user_id, days, notify):
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        c.execute('UPDATE dbo.AlertPreferences SET [LicenseExpiryDays]=?,[NotifyInApp]=? WHERE [UserId]=?', days, int(notify), user_id)
        if not c.rowcount:
            c.execute('INSERT INTO dbo.AlertPreferences ([UserId],[LicenseExpiryDays],[NotifyInApp]) VALUES (?,?,?)', user_id, days, int(notify))
        conn.commit()
    return preferences(user_id)


def messages(user_id):
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        c.execute('SELECT TOP (30) [Id],[Role],[Content],[CreatedAt] FROM dbo.AssistantMessages WHERE [UserId]=? ORDER BY [Id] DESC', user_id)
        return [dict(id=r[0], role=r[1], content=r[2], created_at=r[3].isoformat()) for r in reversed(c.fetchall())]


def add_message(user_id, role, content):
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        c.execute('INSERT INTO dbo.AssistantMessages ([UserId],[Role],[Content]) VALUES (?,?,?)', user_id, role, content)
        conn.commit()


def clear_messages(user_id):
    with closing(get_engine().raw_connection()) as conn:
        c = conn.cursor()
        c.execute('DELETE FROM dbo.AssistantMessages WHERE [UserId]=?', user_id)
        conn.commit()
