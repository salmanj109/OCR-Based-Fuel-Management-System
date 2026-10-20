export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

export type AuthUser = { id: number; name: string; email: string }
export type AuthSession = { user: AuthUser; csrf_token: string }

let csrfToken: string | null = null

export function setCsrfToken(value: string | null) { csrfToken = value }

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message) }
}

export type Truck = {
  id: string | null
  name: string
  fuel_average_l: number
  tank_capacity_l: number
}

export type TruckInput = Omit<Truck, 'id'>

export type TripRecord = {
  origin: string
  destination: string
  distance_km: number
  truck_name: string
  fuel_average_l: number
  fuel_required_l: number
  required_time: string
  date: string
  fuel_status: string | null
}

export type Station = {
  store_number: string | null
  city: string
  address: string
  latitude: number
  longitude: number
}

export type Price = {
  name: string
  your_price: string | null
  savings: string | null
  verified_at: string | null
}

export type ExtractedPrice = {
  Name: string
  'Your Price': string
  Saving: string
}

export type FuelStop = Station & {
  stop_sequence: number
  distance_along_route_km: number
  fuel_remaining_at_stop_l: number
  refuel_amount_l: number
  fuel_stop_reason: string
  savings_display?: string
  warning?: string
}

export type TripPlan = {
  trip_record_id: string | null
  truck: Truck
  origin: string
  destination: string
  distance_km: number
  duration_seconds: number
  route_coordinates: { lat: number; lon: number }[]
  fuel_required_l: number
  current_fuel_l: number
  reserve_km: number
  safe_operating_range_km: number
  fuel_status: string
  fuel_status_message: string
  recommended_stops: FuelStop[]
  safety_failure: { message: string } | null
  station_prices: string
}

export type TripInput = {
  origin: string
  destination: string
  truck_name: string
  current_fuel_l: number
  reserve_km: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  const headers = new Headers(init?.headers)
  if (csrfToken && !['GET', 'HEAD'].includes((init?.method || 'GET').toUpperCase())) {
    headers.set('X-CSRF-Token', csrfToken)
  }
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers, credentials: 'include' })
  } catch {
    throw new Error('Backend is unavailable. Start FastAPI and try again.')
  }
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      setCsrfToken(null)
      window.dispatchEvent(new Event('fuel-session-expired'))
    }
    throw new ApiError(typeof body.detail === 'string' ? body.detail : `Request failed (${response.status})`, response.status)
  }
  return body as T
}

function json(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

export const api = {
  signup: (name: string, email: string, password: string) => request<AuthSession>('/api/auth/signup', json('POST', { name, email, password })),
  login: (email: string, password: string) => request<AuthSession>('/api/auth/login', json('POST', { email, password })),
  forgotPassword: (email: string) => request<{ message: string }>('/api/auth/forgot-password', json('POST', { email })),
  resetPassword: (token: string, password: string) => request<{ message: string }>('/api/auth/reset-password', json('POST', { token, password })),
  me: () => request<AuthSession>('/api/auth/me'),
  logout: () => request<{ status: string }>('/api/auth/logout', { method: 'POST' }),
  dashboard: () => request<{ truck_count: number; planned_trip_count: number; estimated_fuel_demand_l: number; recent_trips: TripRecord[] }>('/api/dashboard'),
  trucks: () => request<Truck[]>('/api/trucks'),
  addTruck: (truck: TruckInput) => request<Truck>('/api/trucks', json('POST', truck)),
  editTruck: (name: string, truck: TruckInput) => request<Truck>(`/api/trucks/${encodeURIComponent(name)}`, json('PUT', truck)),
  deleteTruck: (name: string) => request<{ deleted: boolean }>(`/api/trucks/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  prices: () => request<{ rows: Price[]; price_freshness: string }>('/api/fuel-prices'),
  extractPrices: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<{ rows: ExtractedPrice[]; source: string; ocr_used: boolean }>('/api/fuel-prices/extract', { method: 'POST', body })
  },
  approvePrices: (rows: ExtractedPrice[]) => request<{ saved_count: number }>(
    '/api/fuel-prices/approve',
    json('POST', { rows: rows.map(row => ({ name: row.Name, your_price: row['Your Price'], saving: row.Saving })) }),
  ),
  stations: () => request<{ rows: Station[]; price_freshness: string }>('/api/stations'),
  trips: () => request<{ rows: TripRecord[]; count: number }>('/api/trips'),
  mapConfig: () => request<{ browser_key: string }>('/api/maps/config'),
  planTrip: (trip: TripInput) => request<TripPlan>('/api/trips/plan', json('POST', trip)),
  health: () => request<{ status: string }>('/health'),
  databaseHealth: () => request<{ status: string }>('/health/db'),
}
