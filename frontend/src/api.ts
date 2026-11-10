export const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

export type Role = 'Admin' | 'Fleet Manager' | 'Fuel Coordinator' | 'Dispatcher' | 'Driver'
export type AuthUser = { id: number; name: string; email: string; role: Role; driver_id: number | null }
export type AuthSession = { user: AuthUser; csrf_token: string }
export type ManagedUser = AuthUser & { is_active: boolean }

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
  registration_number: string
  vehicle_type: string
  fuel_type: string
  status: 'Active' | 'Inactive'
}

export type TruckInput = Omit<Truck, 'id'>

export type Driver = {
  id: number
  name: string
  phone: string
  email: string
  national_id: string
  license_number: string
  license_expiry_date: string | null
  assigned_vehicle_name: string | null
  address: string
  status: 'Active' | 'Inactive'
}

export type DriverInput = Omit<Driver, 'id'>

export type TripRecord = {
  id?: string | null
  origin: string
  destination: string
  distance_km: number
  truck_name: string
  fuel_average_l: number
  fuel_required_l: number
  required_time: string
  date: string
  fuel_status: string | null
  current_fuel_l?: number | null
  driver_id?: number | null
  driver_name?: string | null
  reserve_km?: number | null
  route_coordinates?: { lat: number; lon: number }[]
  recommended_stops?: FuelStop[]
}

export type Station = {
  store_number: string | null
  name?: string
  city: string
  address: string
  latitude: number
  longitude: number
  contact_number?: string
  fuel_types?: string
  diesel_price?: number | null
  petrol_price?: number | null
  recorded_price?: number | null
  saving?: number | null
  status?: 'Active' | 'Inactive'
}
export type StationInput = { store_number: string; name: string; address: string; city: string; latitude: number; longitude: number; contact_number: string; fuel_types: string[]; diesel_price: number | null; petrol_price: number | null; status: 'Active' | 'Inactive' }
export type FleetAlert = { id: number; category: string; priority: string; title: string; message: string; driver_id: number | null; created_at: string; is_read: boolean; is_resolved: boolean }
export type ReportData = { trips: TripRecord[]; vehicles: Truck[]; drivers: Driver[]; prices: Price[]; stations: Station[] }
export type ChatMessage = { id: number; role: 'user' | 'assistant'; content: string; created_at: string }

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
  effective_date?: string
}

export type FuelStop = Station & {
  fuel_price?: number | null
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
  remaining_fuel_l: number
  reserve_fuel_l: number
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
  driver_id?: number | null
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
  managedStations: () => request<Station[]>('/api/stations/manage'),
  createStation: (input: StationInput) => request<Station>('/api/stations/manage', json('POST', input)),
  updateStation: (code: string, input: StationInput) => request<Station>(`/api/stations/manage/${encodeURIComponent(code)}`, json('PUT', input)),
  deleteStation: (code: string) => request<{ deleted: boolean }>(`/api/stations/manage/${encodeURIComponent(code)}`, { method: 'DELETE' }),
  alerts: () => request<{ rows: FleetAlert[]; unread_count: number }>('/api/alerts'),
  updateAlert: (id: number, action: 'read' | 'resolve') => request<{ updated: boolean }>(`/api/alerts/${id}`, json('PATCH', { action })),
  alertPreferences: () => request<{ license_expiry_days: number; notify_in_app: boolean }>('/api/alerts/preferences'),
  updateAlertPreferences: (input: { license_expiry_days: number; notify_in_app: boolean }) => request<{ license_expiry_days: number; notify_in_app: boolean }>('/api/alerts/preferences', json('PUT', input)),
  reports: () => request<ReportData>('/api/reports'),
  chatHistory: () => request<ChatMessage[]>('/api/assistant/history'),
  chat: (message: string) => request<{ answer: string }>('/api/assistant/chat', json('POST', { message })),
  clearChat: () => request<{ cleared: boolean }>('/api/assistant/history', { method: 'DELETE' }),
  users: () => request<ManagedUser[]>('/api/auth/users'),
  createUser: (input: { name: string; email: string; password: string; role: Role; driver_id: number | null }) => request<ManagedUser>('/api/auth/users', json('POST', input)),
  updateUser: (id: number, input: { role: Role; driver_id: number | null; is_active: boolean }) => request<ManagedUser>(`/api/auth/users/${id}`, json('PUT', input)),
  myProfile: () => request<{ driver: Driver; vehicle: Truck | null }>('/api/my/profile'),
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
  drivers: () => request<Driver[]>('/api/drivers'),
  addDriver: (driver: DriverInput) => request<Driver>('/api/drivers', json('POST', driver)),
  editDriver: (id: number, driver: DriverInput) => request<Driver>(`/api/drivers/${id}`, json('PUT', driver)),
  deleteDriver: (id: number) => request<{ deleted: boolean }>(`/api/drivers/${id}`, { method: 'DELETE' }),
  prices: () => request<{ rows: Price[]; price_freshness: string }>('/api/fuel-prices'),
  extractPrices: (file: File) => {
    const body = new FormData()
    body.append('file', file)
    return request<{ rows: ExtractedPrice[]; source: string; ocr_used: boolean }>('/api/fuel-prices/extract', { method: 'POST', body })
  },
  approvePrices: (rows: ExtractedPrice[], supplier_name = '') => request<{ saved_count: number }>(
    '/api/fuel-prices/approve',
    json('POST', { supplier_name, rows: rows.map(row => ({ name: row.Name, your_price: row['Your Price'], saving: row.Saving, effective_date: row.effective_date || null })) }),
  ),
  stations: () => request<{ rows: Station[]; price_freshness: string }>('/api/stations'),
  trips: () => request<{ rows: TripRecord[]; count: number; estimated_fuel_l: number }>('/api/trips'),
  saveTrip: (plan: TripPlan, input: TripInput) => request<{ trip_record_id: string | null }>('/api/trips', json('POST', { ...input, distance_km: plan.distance_km, duration_seconds: plan.duration_seconds, fuel_status: plan.fuel_status, route_coordinates: plan.route_coordinates, recommended_stops: plan.recommended_stops })),
  mapConfig: () => request<{ browser_key: string }>('/api/maps/config'),
  planTrip: (trip: TripInput) => request<TripPlan>('/api/trips/plan', json('POST', trip)),
  health: () => request<{ status: string }>('/health'),
  databaseHealth: () => request<{ status: string }>('/health/db'),
}
