import { useEffect, useState } from 'react'
import { api, type Driver, type Truck, type TripRecord } from './api'

type Section = 'dashboard' | 'profile' | 'vehicle' | 'trips' | 'history' | 'instructions'

export default function DriverHome({ section }: { section: Section }) {
  const [profile, setProfile] = useState<{ driver: Driver; vehicle: Truck | null } | null>(null)
  const [trips, setTrips] = useState<TripRecord[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    Promise.all([api.myProfile(), api.trips()]).then(([person, history]) => {
      if (active) { setProfile(person); setTrips(history.rows) }
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Unable to load your information') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const title = { dashboard: 'Driver Dashboard', profile: 'My Profile', vehicle: 'My Vehicle', trips: 'My Trips', history: 'Trip History', instructions: 'Fuel Instructions' }[section]
  return <div className="driver-home"><h1>{title}</h1>
    {loading && <p role="status">Loading your information…</p>}
    {error && <div className="notice error" role="alert">{error}</div>}
    {profile && (section === 'dashboard' || section === 'profile') && <section className="driver-card"><h2>Driver profile</h2><p><strong>{profile.driver.name}</strong> · {profile.driver.status}</p><p>{profile.driver.phone} · {profile.driver.email || 'No email recorded'}</p><p>License: {profile.driver.license_number}</p></section>}
    {profile && (section === 'dashboard' || section === 'vehicle') && <section className="driver-card"><h2>Assigned vehicle</h2>{profile.vehicle ? <><p><strong>{profile.vehicle.name}</strong> · {profile.vehicle.registration_number || 'No registration recorded'}</p><p>{profile.vehicle.fuel_type} · {profile.vehicle.fuel_average_l} L / 100 km · Tank {profile.vehicle.tank_capacity_l} L</p></> : <p>No vehicle assigned.</p>}</section>}
    {(section === 'dashboard' || section === 'trips' || section === 'history') && <section className="driver-card"><h2>{section === 'history' ? 'Trip history' : 'Assigned trips'}</h2>{!trips.length ? <p>No trips assigned yet.</p> : <div className="driver-trip-list">{trips.map((trip, index) => <article className="driver-trip" key={trip.id || index}><strong>{trip.origin} → {trip.destination}</strong><span>{trip.date} · {trip.truck_name}</span><p>{trip.distance_km.toFixed(1)} km · {trip.required_time} · {trip.fuel_required_l.toFixed(1)} L required</p><p>Status: {trip.fuel_status || 'Planned'} · Current fuel: {trip.current_fuel_l ?? 'Not recorded'} L</p>{!!trip.recommended_stops?.length && <div><strong>Recommended refuelling stops</strong><ol>{trip.recommended_stops.map((stop, stopIndex) => <li key={stopIndex}>{stop.city}, {stop.address} · {stop.refuel_amount_l} L</li>)}</ol></div>}</article>)}</div>}</section>}
    {section === 'instructions' && <section className="driver-card"><h2>Before your trip</h2><p>Check the assigned vehicle, fuel level, route and recommended stops on your trip. Follow the saved plan and contact your dispatcher if the fuel status or route changes.</p></section>}
  </div>
}
