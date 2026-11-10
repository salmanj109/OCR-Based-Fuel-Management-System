import { useEffect, useRef, useState } from 'react'
import { api, type TripPlan, type Station } from './api'

type Point = { lat: number; lng: number }
type MapObject = { setMap: (map: null) => void }
type MapInstance = { fitBounds: (bounds: Bounds, padding: number) => void }
type Bounds = { extend: (point: Point) => void }
type GoogleMaps = {
  Map: new (element: HTMLElement, options: Record<string, unknown>) => MapInstance
  Polyline: new (options: Record<string, unknown>) => MapObject
  Marker: new (options: Record<string, unknown>) => MapObject
  LatLngBounds: new () => Bounds
}

declare global {
  interface Window {
    google?: { maps: GoogleMaps }
  }
}

let googleMapsPromise: Promise<GoogleMaps> | null = null
const emptyStations: Station[] = []

function loadGoogleMaps(key: string): Promise<GoogleMaps> {
  if (window.google?.maps) return Promise.resolve(window.google.maps)
  if (!googleMapsPromise) {
    googleMapsPromise = new Promise<GoogleMaps>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`
      script.async = true
      script.onload = () => window.google?.maps ? resolve(window.google.maps) : reject(new Error('Google Maps did not initialize.'))
      script.onerror = () => reject(new Error('Google Maps could not load. Check your demo key and connection.'))
      document.head.appendChild(script)
    }).catch(error => {
      googleMapsPromise = null
      throw error
    })
  }
  return googleMapsPromise
}

export default function MapPanel({ plan, stations = emptyStations }: { plan: TripPlan | null; stations?: Station[] }) {
  const element = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!element.current) return
    let cancelled = false
    let overlays: MapObject[] = []
    const container = element.current
    setError('')

    async function showMap() {
      try {
        const { browser_key } = await api.mapConfig()
        const maps = await loadGoogleMaps(browser_key)
        if (cancelled) return

        const points = plan?.route_coordinates.map(point => ({ lat: point.lat, lng: point.lon })) || []
        const map = new maps.Map(container, {
          center: points[0] || (stations.length ? { lat: stations[0].latitude, lng: stations[0].longitude } : { lat: 30.3753, lng: 69.3451 }),
          zoom: points.length ? 8 : 5, mapTypeControl: false, streetViewControl: false,
        })
        if (points.length) {
          overlays = [new maps.Polyline({ path: points, map, strokeColor: '#0866b2', strokeWeight: 5 })]
          overlays.push(new maps.Marker({ position: points[0], map, title: `Origin: ${plan?.origin}` }))
          overlays.push(new maps.Marker({ position: points[points.length - 1], map, title: `Destination: ${plan?.destination}` }))
          const bounds = new maps.LatLngBounds()
          points.forEach(point => bounds.extend(point))
          plan?.recommended_stops.forEach(stop => {
            const position = { lat: stop.latitude, lng: stop.longitude }
            bounds.extend(position)
            overlays.push(new maps.Marker({
              position, map, title: `Stop ${stop.stop_sequence}: ${stop.address}, ${stop.city}`,
            }))
          })
          map.fitBounds(bounds, 24)
        } else if (stations.length) {
          const bounds = new maps.LatLngBounds()
          stations.filter(station => station.status !== 'Inactive').forEach(station => {
            const position = { lat: station.latitude, lng: station.longitude }
            bounds.extend(position)
            overlays.push(new maps.Marker({ position, map, title: `${station.name || station.store_number}: ${station.address}, ${station.city}` }))
          })
          map.fitBounds(bounds, 24)
        }
      } catch (reason) {
        if (!cancelled) setError((reason as Error).message)
      }
    }
    void showMap()
    return () => {
      cancelled = true
      overlays.forEach(overlay => overlay.setMap(null))
      container.replaceChildren()
    }
  }, [plan, stations])

  return <>{error && <div className="notice error" role="alert">{error}</div>}<div ref={element} className="route-map" role="img" aria-label="Planned route on Google Maps" /></>
}
