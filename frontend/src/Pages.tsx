import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import MapPanel from './MapPanel'
import { api, API_BASE, type ExtractedPrice, type Price, type Station, type TripInput, type TripPlan, type TripRecord, type Truck, type TruckInput } from './api'

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="page-header"><span className="eyebrow">FLEET OPERATIONS</span><h1>{title}</h1><p>{subtitle}</p></header>
}
function Notice({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return <div role={success ? 'status' : 'alert'} className={`notice ${success ? 'success' : 'error'}`}>{children}</div>
}
function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div> }
function n(value: number | null | undefined, decimals = 1) { return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(decimals) : '—' }

function TripTable({ rows, details = false }: { rows: TripRecord[]; details?: boolean }) {
  const [selected, setSelected] = useState<number | null>(null)
  return <><div className="table-wrap"><table><thead><tr><th>Date</th><th>Route</th><th>Truck</th><th>Distance</th><th>Fuel estimate</th>{details && <th>Details</th>}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.date}-${row.truck_name}-${index}`}><td>{row.date}</td><td>{row.origin} → {row.destination}</td><td>{row.truck_name}</td><td>{n(row.distance_km)} km</td><td>{n(row.fuel_required_l, 2)} L</td>{details && <td><button className="text-button" onClick={() => setSelected(selected === index ? null : index)}>{selected === index ? 'Hide' : 'View'}</button></td>}</tr>)}</tbody></table></div>
    {selected !== null && rows[selected] && <div className="detail"><strong>Trip details</strong><p>Time: {rows[selected].required_time || 'Not recorded'} · Consumption: {n(rows[selected].fuel_average_l, 2)} L/100 km</p><p>Fuel status was not saved in the existing Trip_Records table.</p></div>}
  </>
}

export function Dashboard({ plan }: { plan: TripPlan | null }) {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.dashboard>> | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { void api.dashboard().then(setSummary).catch(error => setError(error.message)) }, [])
  return <><Header title="Dashboard" subtitle="A live overview of registered trucks and saved trip plans." />{error && <Notice>{error}</Notice>}
    <div className="metric-grid"><div className="metric"><span>Registered trucks</span><strong>{summary?.truck_count ?? '—'}</strong><small>From SQL Server</small></div><div className="metric"><span>Planned trips</span><strong>{summary?.planned_trip_count ?? '—'}</strong><small>From Trip_Records</small></div><div className="metric"><span>Estimated fuel demand</span><strong>{summary ? n(summary.estimated_fuel_demand_l, 1) : '—'} <em>L</em></strong><small>Calculated from saved trips</small></div><div className="metric"><span>Latest fuel status</span><strong className="metric-word">{plan?.fuel_status || 'Unverified'}</strong><small>Current browser session</small></div></div>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ACTIVITY</span><h2>Recent trips</h2></div></div>{summary?.recent_trips.length ? <TripTable rows={summary.recent_trips} /> : <Empty>{error ? 'Trip data will appear when SQL Server is available.' : 'No trips have been saved yet.'}</Empty>}</section>
    <section className="panel muted-panel"><h2>Route preview</h2>{plan ? <MapPanel plan={plan} /> : <><p>Plan a trip to see its route, fuel demand, and recommended stops.</p><Link className="button" to="/trip-planner">Open Trip Planner →</Link></>}</section>
  </>
}

export function TruckRegistry() {
  const blank: TruckInput = { name: '', fuel_average_l: 0, tank_capacity_l: 0 }
  const [rows, setRows] = useState<Truck[]>([])
  const [form, setForm] = useState<TruckInput>(blank)
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => void api.trucks().then(setRows).catch(error => setError(error.message))
  useEffect(() => { load() }, [])
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setSuccess('')
    if (!form.name.trim() || form.fuel_average_l <= 0 || form.tank_capacity_l <= 0) { setError('Enter a name, consumption, and capacity greater than zero.'); return }
    setBusy(true)
    try { if (editing) await api.editTruck(editing, form); else await api.addTruck(form); setSuccess(editing ? 'Truck updated.' : 'Truck registered.'); setEditing(null); setForm(blank); load() }
    catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  async function remove(name: string) {
    if (!window.confirm(`Delete ${name} from SQL Server?`)) return
    setBusy(true); setError(''); setSuccess('')
    try { await api.deleteTruck(name); setSuccess('Truck deleted.'); load() }
    catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  return <><Header title="Truck Registry" subtitle="Register and maintain the trucks used in fuel planning." />{error && <Notice>{error}</Notice>}{success && <Notice success>{success}</Notice>}
    <div className="two-column"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">FLEET DATA</span><h2>{editing ? 'Edit truck' : 'Register a truck'}</h2></div></div>
      <form className="form-grid" onSubmit={save}><label>Truck name or identifier<input value={form.name} maxLength={120} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Fuel consumption (L/100 km)<input type="number" min="0.01" step="0.01" value={form.fuel_average_l || ''} onChange={event => setForm({ ...form, fuel_average_l: Number(event.target.value) })} required /></label>
        <label>Tank capacity (L)<input type="number" min="0.01" step="0.01" value={form.tank_capacity_l || ''} onChange={event => setForm({ ...form, tank_capacity_l: Number(event.target.value) })} required /></label>
        <div className="button-row"><button disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Register truck'}</button>{editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setForm(blank) }}>Cancel</button>}</div></form>
    </section><section className="panel"><div className="panel-heading"><div><span className="eyebrow">REGISTERED</span><h2>Trucks ({rows.length})</h2></div></div>
      {rows.length ? <div className="list-stack">{rows.map(truck => <div className="list-item" key={truck.id || truck.name}><div><strong>{truck.name}</strong><small>{n(truck.fuel_average_l, 2)} L/100 km · {n(truck.tank_capacity_l, 2)} L tank</small></div><div className="inline-actions"><button className="text-button" onClick={() => { setEditing(truck.name); setForm({ name: truck.name, fuel_average_l: truck.fuel_average_l, tank_capacity_l: truck.tank_capacity_l }) }}>Edit</button><button className="text-button danger" onClick={() => void remove(truck.name)}>Delete</button></div></div>)}</div> : <Empty>No truck records available.</Empty>}
    </section></div>
  </>
}

export function FuelPrices() {
  const [prices, setPrices] = useState<Price[]>([])
  const [rows, setRows] = useState<ExtractedPrice[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  useEffect(() => { void api.prices().then(result => setPrices(result.rows)).catch(error => setError(error.message)) }, [])
  async function extract() {
    if (!file) { setError('Choose a PDF first.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('PDF must be 10 MB or smaller.'); return }
    setBusy(true); setError(''); setSuccess('')
    try { const result = await api.extractPrices(file); setRows(result.rows); setPage(0) }
    catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  async function approve() {
    setBusy(true); setError(''); setSuccess('')
    try { const result = await api.approvePrices(rows); setSuccess(`${result.updated_count} existing database rows updated.`); setRows([]); setPrices((await api.prices()).rows) }
    catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  function edit(index: number, key: keyof ExtractedPrice, value: string) {
    setRows(previous => previous.map((row, current) => current === index ? { ...row, [key]: value } : row))
  }
  return <><Header title="Fuel Prices" subtitle="Extract readable pricing PDFs, review values, and approve database updates." />{error && <Notice>{error}</Notice>}{success && <Notice success>{success}</Notice>}
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">DOCUMENT PROCESSING</span><h2>Upload a pricing PDF</h2></div></div><p className="subtle">Text extraction only. Scanned-image OCR is not implemented. The parser supports the existing pricing document format.</p><div className="button-row"><input type="file" accept=".pdf,application/pdf" aria-label="Pricing PDF" onChange={event => setFile(event.target.files?.[0] || null)} /><button disabled={busy} onClick={() => void extract()}>{busy ? 'Working…' : 'Extract rows'}</button></div></section>
    {rows.length > 0 && <section className="panel"><div className="panel-heading"><div><span className="eyebrow">REVIEW REQUIRED</span><h2>Extracted rows ({rows.length})</h2></div></div><p className="subtle">Review every page and correct values before approving. Saving updates only matching names already in Discounted_Fuel_Price.</p><div className="table-wrap"><table><thead><tr><th>Row</th><th>Name</th><th>Your price</th><th>Saving</th></tr></thead><tbody>{rows.slice(page * 25, page * 25 + 25).map((row, offset) => <tr key={page * 25 + offset}><td>{page * 25 + offset + 1}</td>{(['Name', 'Your Price', 'Saving'] as const).map(key => <td key={key}><input className="table-input" aria-label={`${key} row ${page * 25 + offset + 1}`} value={row[key]} onChange={event => edit(page * 25 + offset, key, event.target.value)} /></td>)}</tr>)}</tbody></table></div><div className="button-row spread"><div className="button-row"><button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(rows.length / 25)}</span><button className="secondary" disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage(page + 1)}>Next</button></div><button disabled={busy} onClick={() => void approve()}>Approve and save all rows</button></div></section>}
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">DATABASE</span><h2>Recorded prices</h2></div></div><p className="subtle">Price freshness is unverified; the inspected source does not establish a verified timestamp.</p>{prices.length ? <div className="table-wrap"><table><thead><tr><th>Name</th><th>Your price</th><th>Savings</th></tr></thead><tbody>{prices.map((price, index) => <tr key={`${price.name}-${index}`}><td>{price.name}</td><td>{price.your_price ?? '—'}</td><td>{price.savings ?? '—'}</td></tr>)}</tbody></table></div> : <Empty>No database prices available.</Empty>}</section>
  </>
}

function StopList({ stops }: { stops: TripPlan['recommended_stops'] }) {
  return <div className="list-stack">{stops.map((stop, index) => <div className="list-item" key={`${stop.store_number || stop.address}-${index}`}><div><strong>Stop {stop.stop_sequence}: {stop.address}, {stop.city}</strong><small>{n(stop.distance_along_route_km)} km along route · {n(stop.refuel_amount_l, 2)} L to fill</small><small>{stop.fuel_stop_reason}</small></div><span className="pill amber">{stop.savings_display ? `Recorded saving ${stop.savings_display}` : 'Price unverified'}</span></div>)}</div>
}

export function TripPlanner({ onPlan }: { onPlan: (plan: TripPlan) => void }) {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [form, setForm] = useState<TripInput>({ origin: '', destination: '', truck_name: '', current_fuel_l: 0, reserve_km: 20 })
  const [result, setResult] = useState<TripPlan | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void api.trucks().then(setTrucks).catch(error => setError(error.message)) }, [])
  const selected = trucks.find(truck => truck.name === form.truck_name)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setResult(null)
    if (!selected) { setError('Select a registered truck.'); return }
    if (form.current_fuel_l > selected.tank_capacity_l) { setError('Current fuel exceeds this truck’s tank capacity.'); return }
    setBusy(true)
    try { const plan = await api.planTrip(form); setResult(plan); onPlan(plan) }
    catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  return <><Header title="Trip Planner" subtitle="Plan a route with a registered truck and its real fuel capacity." />{error && <Notice>{error}</Notice>}
    <div className="two-column planner-layout"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">NEW PLAN</span><h2>Trip inputs</h2></div></div><form className="form-grid" onSubmit={submit}>
      <label>Registered truck<select value={form.truck_name} onChange={event => setForm({ ...form, truck_name: event.target.value })} required><option value="">Select a truck</option>{trucks.map(truck => <option key={truck.id || truck.name} value={truck.name}>{truck.name}</option>)}</select></label>
      {selected && <div className="hint">{n(selected.fuel_average_l, 2)} L/100 km · {n(selected.tank_capacity_l, 2)} L tank</div>}
      <label>Origin<input value={form.origin} onChange={event => setForm({ ...form, origin: event.target.value })} placeholder="City or address" required /></label>
      <label>Destination<input value={form.destination} onChange={event => setForm({ ...form, destination: event.target.value })} placeholder="City or address" required /></label>
      <label>Current fuel (L)<input type="number" min="0" max={selected?.tank_capacity_l} step="0.01" value={form.current_fuel_l} onChange={event => setForm({ ...form, current_fuel_l: Number(event.target.value) })} required /></label>
      <label>Emergency reserve (km)<input type="number" min="0" max="1000" step="1" value={form.reserve_km} onChange={event => setForm({ ...form, reserve_km: Number(event.target.value) })} required /></label>
      <div className="hint">The original planner used a 20 km reserve. Set this trip’s reserve explicitly.</div><button disabled={busy || !trucks.length}>{busy ? 'Calculating route…' : 'Calculate and save trip'}</button>
    </form></section><section className="panel map-card"><div className="panel-heading"><div><span className="eyebrow">ROUTE</span><h2>Map preview</h2></div></div>{result ? <MapPanel plan={result} /> : <Empty>Enter a trip to display a route from OpenRouteService.</Empty>}</section></div>
    {result && <><div className="metric-grid"><div className="metric"><span>Distance</span><strong>{n(result.distance_km)} <em>km</em></strong></div><div className="metric"><span>Estimated time</span><strong>{n(result.duration_seconds / 3600)} <em>h</em></strong></div><div className="metric"><span>Required fuel</span><strong>{n(result.fuel_required_l, 2)} <em>L</em></strong></div><div className="metric"><span>Safe range</span><strong>{n(result.safe_operating_range_km)} <em>km</em></strong></div></div>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">FUEL STATUS</span><h2>{result.fuel_status}</h2></div></div><p>{result.fuel_status_message}</p>{result.safety_failure && <Notice>{result.safety_failure.message}</Notice>}</section>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ALONG THE ROUTE</span><h2>Recommended fuel stops</h2></div></div><p className="subtle">Station savings and prices are from existing database records. Freshness and availability are unverified.</p>{result.recommended_stops.length ? <StopList stops={result.recommended_stops} /> : <Empty>No refuelling stops were recommended.</Empty>}</section>
    </>}
  </>
}

export function FuelStops({ plan }: { plan: TripPlan | null }) {
  const [stations, setStations] = useState<Station[]>([])
  const [error, setError] = useState('')
  useEffect(() => { void api.stations().then(result => setStations(result.rows)).catch(error => setError(error.message)) }, [])
  return <><Header title="Fuel Stops" subtitle="Known station locations and recommendations from your latest trip plan." />{error && <Notice>{error}</Notice>}
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">TRIP PLAN</span><h2>Recommended stops</h2></div></div>{plan?.recommended_stops.length ? <StopList stops={plan.recommended_stops} /> : <Empty>Plan a trip to see reachable fuel stops along its route.</Empty>}</section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">EXISTING DATABASE</span><h2>Station directory</h2></div></div><p className="subtle">Locations come from LovesLocations. Live availability and price freshness are unverified.</p>{stations.length ? <div className="table-wrap"><table><thead><tr><th>Store</th><th>City</th><th>Address</th><th>Coordinates</th></tr></thead><tbody>{stations.map((station, index) => <tr key={`${station.store_number}-${index}`}><td>{station.store_number || '—'}</td><td>{station.city}</td><td>{station.address}</td><td>{n(station.latitude, 4)}, {n(station.longitude, 4)}</td></tr>)}</tbody></table></div> : <Empty>No station records available.</Empty>}</section>
  </>
}

export function TripHistory() {
  const [rows, setRows] = useState<TripRecord[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { void api.trips().then(result => { setRows(result.rows); setTotal(result.count) }).catch(error => setError(error.message)) }, [])
  const filtered = useMemo(() => rows.filter(row => `${row.origin} ${row.destination} ${row.truck_name} ${row.date}`.toLowerCase().includes(query.toLowerCase())), [rows, query])
  return <><Header title="Trip History" subtitle="Search saved plans in the existing Trip_Records table." />{error && <Notice>{error}</Notice>}
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">RECORDS</span><h2>{total} planned trips</h2></div><input className="search" aria-label="Search trips" placeholder="Search route, truck, or date" value={query} onChange={event => setQuery(event.target.value)} /></div>{filtered.length ? <TripTable rows={filtered} details /> : <Empty>{query ? 'No trips match your search.' : 'No trips have been saved yet.'}</Empty>}{total > rows.length && <p className="subtle">Showing the most recent {rows.length} records.</p>}</section>
  </>
}

export function Settings() {
  const [apiState, setApiState] = useState('Checking…')
  const [dbState, setDbState] = useState('Checking…')
  useEffect(() => { void api.health().then(() => setApiState('Connected')).catch(() => setApiState('Unavailable')); void api.databaseHealth().then(() => setDbState('Connected')).catch(() => setDbState('Unavailable')) }, [])
  return <><Header title="Settings" subtitle="Local connection status and configuration needed for live data." />
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">SYSTEM</span><h2>Connection status</h2></div></div><div className="list-stack"><div className="list-item"><strong>FastAPI backend</strong><span>{apiState}</span></div><div className="list-item"><strong>SQL Server</strong><span>{dbState}</span></div><div className="list-item"><strong>API address</strong><code>{API_BASE}</code></div></div></section>
    <section className="panel"><h2>Local configuration</h2><p>Set SQL Server values and <code>API_KEY</code> in your local <code>backend/.env</code>. This file is ignored by Git. The existing project has no authentication or roles, so keep write endpoints limited to trusted local development until authorization is designed.</p></section>
  </>
}
