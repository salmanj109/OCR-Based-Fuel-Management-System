import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { FuelStop, TripPlan } from './api'

export default function MapPanel({ plan }: { plan: TripPlan }) {
  const element = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!element.current || !plan.route_coordinates.length) return
    const map = L.map(element.current)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)
    const points: L.LatLngExpression[] = plan.route_coordinates.map(point => [point.lat, point.lon])
    const line = L.polyline(points, { color: '#1e614e', weight: 5 }).addTo(map)
    map.fitBounds(line.getBounds(), { padding: [24, 24] })
    plan.recommended_stops.forEach((stop: FuelStop) => {
      const popup = document.createElement('span')
      popup.textContent = `Stop ${stop.stop_sequence}: ${stop.address}, ${stop.city}`
      L.circleMarker([stop.latitude, stop.longitude], {
        radius: 8, color: '#9b620e', fillColor: '#e9a23b', fillOpacity: 1,
      }).addTo(map).bindPopup(popup)
    })
    return () => { map.remove() }
  }, [plan])

  if (!plan.route_coordinates.length) {
    return <div className="empty">No route geometry was returned for this trip.</div>
  }
  return <div ref={element} className="route-map" role="img" aria-label="Planned route on OpenStreetMap" />
}
