import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import MapPanel from './MapPanel'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import { PAGE_SIZE, Pagination, RowActions, Toast, useToast } from './FleetUI'
import { api, API_BASE, type Driver, type ExtractedPrice, type Price, type TripInput, type TripPlan, type TripRecord, type Truck, type TruckInput } from './api'

function exportCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (value: string | number | null | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`
  const blob = new Blob(['\ufeff', [headers, ...rows].map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}

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
  return <><div className="table-wrap"><table><thead><tr><th>ID</th><th>Date</th><th>Route</th><th>Vehicle</th><th>Driver</th><th>Distance</th><th>Current fuel</th><th>Fuel estimate</th><th>Duration</th><th>Status</th>{details && <th>Actions</th>}</tr></thead>
    <tbody>{rows.map((row, index) => <tr key={`${row.date}-${row.truck_name}-${index}`}><td>{row.id || '—'}</td><td>{row.date}</td><td>{row.origin} → {row.destination}</td><td>{row.truck_name}</td><td>{row.driver_name || '—'}</td><td>{n(row.distance_km)} km</td><td>{n(row.current_fuel_l, 2)} L</td><td>{n(row.fuel_required_l, 2)} L</td><td>{row.required_time}</td><td>{row.fuel_status || 'Not recorded'}</td>{details && <td><button className="text-button" onClick={() => setSelected(selected === index ? null : index)}>{selected === index ? 'Hide' : 'View'}</button></td>}</tr>)}</tbody></table></div>
    {selected !== null && rows[selected] && <div className="detail"><strong>Trip details</strong><p>Time: {rows[selected].required_time || 'Not recorded'} · Consumption: {n(rows[selected].fuel_average_l, 2)} L/100 km</p><p>Current fuel: {n(rows[selected].current_fuel_l, 2)} L · Reserve: {n(rows[selected].reserve_km, 1)} km · Status: {rows[selected].fuel_status || 'Not recorded'}</p><p>Driver: {rows[selected].driver_name || 'Unassigned'} · Stops: {rows[selected].recommended_stops?.length || 0}</p>{rows[selected].recommended_stops?.map((stop, index) => <p key={index}>Stop {stop.stop_sequence}: {stop.name || stop.store_number || stop.address}, {stop.city} · {n(stop.refuel_amount_l, 2)} L</p>)}{!!rows[selected].route_coordinates?.length && <MapPanel plan={{ route_coordinates: rows[selected].route_coordinates!, recommended_stops: rows[selected].recommended_stops || [], origin: rows[selected].origin, destination: rows[selected].destination } as TripPlan} />}<button className="secondary" onClick={() => window.print()}>Print report</button></div>}
  </>
}

export function TruckRegistry({ readOnly = false }: { readOnly?: boolean }) {
  const blank: TruckInput = { name: '', fuel_average_l: 0, tank_capacity_l: 0, registration_number: '', vehicle_type: 'Truck', fuel_type: 'Diesel', status: 'Active' }
  const [rows, setRows] = useState<Truck[]>([])
  const [form, setForm] = useState<TruckInput>(blank)
  const [editing, setEditing] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [error, setError] = useState('')
  const { message: success, setMessage: setSuccess } = useToast()
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const filtered = rows.filter(truck => `${truck.name} ${truck.registration_number}`.toLowerCase().includes(query.toLowerCase()) && (!typeFilter || truck.vehicle_type === typeFilter) && (!statusFilter || truck.status === statusFilter))
  useEffect(() => setPage(0), [query, typeFilter, statusFilter])
  useEffect(() => { if (page > 0 && page * PAGE_SIZE >= filtered.length) setPage(Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1)) }, [filtered.length, page])
  const dialogRef = useRef<HTMLDialogElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const load = () => void api.trucks().then(setRows).catch(error => setError(error.message)).finally(() => setLoading(false))
  useEffect(() => { load() }, [])
  useEffect(() => { if (formOpen && dialogRef.current && !dialogRef.current.open) { dialogRef.current.showModal(); nameInputRef.current?.focus() } }, [formOpen])
  function closeForm() {
    if (busy) return
    setFormOpen(false)
    setEditing(null)
    setForm(blank)
    setError('')
    addButtonRef.current?.focus()
  }
  function openAdd() {
    setForm(blank)
    setEditing(null)
    setError('')
    setSuccess('')
    setFormOpen(true)
  }
  function openEdit(truck: Truck) {
    setForm({ ...truck })
    setEditing(truck.name)
    setError('')
    setSuccess('')
    setFormOpen(true)
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setSuccess('')
    if (!form.name.trim() || form.fuel_average_l <= 0 || form.tank_capacity_l <= 0) { setError('Enter a name, consumption, and capacity greater than zero.'); return }
    setBusy(true)
    try { if (editing) await api.editTruck(editing, form); else await api.addTruck(form); setSuccess(editing ? 'Vehicle updated.' : 'Vehicle added.'); setFormOpen(false); setEditing(null); setForm(blank); load(); addButtonRef.current?.focus() }
    catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  async function remove(name: string) {
    setBusy(true); setError(''); setSuccess('')
    try { await api.deleteTruck(name); setSuccess('Vehicle deleted.'); load() }
    catch (error) { setError((error as Error).message) } finally { setBusy(false); setPendingDelete(null) }
  }
  return <div className="vehicle-page">
    <Toast message={success} />{error && !formOpen && <Notice>{error}</Notice>}
    <section className="vehicle-list-card" aria-label="Vehicle list">
      <div className="vehicle-list-heading"><div><span className="eyebrow">FLEET DIRECTORY</span><h2>Vehicle List <span className="vehicle-count">{filtered.length}</span></h2><p>Keep vehicle details and fuel specifications up to date.</p></div>{!readOnly && <button ref={addButtonRef} className="vehicle-add-button" onClick={openAdd}>+ Add Vehicle</button>}</div>
      <div className="vehicle-toolbar"><label className="vehicle-search"><span aria-hidden="true">⌕</span><input aria-label="Search vehicles" placeholder="Search vehicles or registration..." value={query} onChange={e => setQuery(e.target.value)} /></label><select aria-label="Vehicle type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="">All types</option>{[...new Set(rows.map(v => v.vehicle_type))].map(v => <option key={v}>{v}</option>)}</select><select aria-label="Vehicle status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option><option>Active</option><option>Inactive</option></select><button className="vehicle-export" onClick={() => exportCsv('vehicles.csv', ['Name','Registration','Type','Fuel type','L/100 km','Tank L','Status'], filtered.map(v => [v.name,v.registration_number,v.vehicle_type,v.fuel_type,v.fuel_average_l,v.tank_capacity_l,v.status]))}>Export CSV</button></div>
      <div className="vehicle-table-wrap">{loading ? <div className="vehicle-table-empty" role="status">Loading vehicles…</div> : <><table className="vehicle-table"><thead><tr><th>Vehicle Name</th><th>Registration</th><th>Type</th><th>Fuel</th><th>Fuel Consumption</th><th>Tank Capacity</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(truck => <tr key={truck.id || truck.name}><td><span className="vehicle-identity"><span className="vehicle-avatar" aria-hidden="true">{truck.name.trim().charAt(0).toUpperCase()}</span><strong>{truck.name}</strong></span></td><td>{truck.registration_number || <span className="vehicle-muted">Not set</span>}</td><td>{truck.vehicle_type}</td><td>{truck.fuel_type}</td><td>{n(truck.fuel_average_l, 2)} <span className="vehicle-unit">L/100 km</span></td><td>{n(truck.tank_capacity_l, 2)} <span className="vehicle-unit">L</span></td><td><span className={`vehicle-status ${truck.status === 'Active' ? 'is-active' : 'is-inactive'}`}><span aria-hidden="true" />{truck.status}</span></td><td>{readOnly ? 'View only' : <RowActions name={truck.name} busy={busy} onEdit={() => openEdit(truck)} onDelete={() => setPendingDelete(truck.name)} />}</td></tr>)}</tbody></table>{!filtered.length && <div className="vehicle-table-empty"><strong>{error ? 'Unable to load vehicles' : query || typeFilter || statusFilter ? 'No matching vehicles' : 'No vehicles yet'}</strong><p>{query || typeFilter || statusFilter ? 'Try a different search or filter.' : 'Add your first vehicle to start planning trips.'}</p></div>}</>}</div><Pagination total={filtered.length} page={page} onPageChange={setPage} />
    </section>
    <ConfirmDeleteDialog name={pendingDelete} busy={busy} onCancel={() => setPendingDelete(null)} onConfirm={() => { if (pendingDelete) void remove(pendingDelete) }} />
    {formOpen && <dialog className="vehicle-dialog" ref={dialogRef} aria-labelledby="vehicle-dialog-title" onCancel={event => { if (busy) event.preventDefault(); else closeForm() }}><div className="vehicle-dialog-heading"><div><span className="eyebrow">FLEET DATA</span><h2 id="vehicle-dialog-title">{editing ? 'Edit Vehicle' : 'Add Vehicle'}</h2></div><button type="button" className="vehicle-dialog-close" onClick={closeForm} aria-label="Close form">×</button></div>{error && <Notice>{error}</Notice>}
      <form className="form-grid" onSubmit={save}><label>Vehicle name or identifier<input ref={nameInputRef} value={form.name} maxLength={120} onChange={event => setForm({ ...form, name: event.target.value })} required /></label>
        <label>Fuel consumption (L/100 km)<input type="number" min="0.01" step="0.01" value={form.fuel_average_l || ''} onChange={event => setForm({ ...form, fuel_average_l: Number(event.target.value) })} required /></label>
        <label>Tank capacity (L)<input type="number" min="0.01" step="0.01" value={form.tank_capacity_l || ''} onChange={event => setForm({ ...form, tank_capacity_l: Number(event.target.value) })} required /></label>
        <label>Registration number<input value={form.registration_number} onChange={e => setForm({ ...form, registration_number: e.target.value })} /></label><label>Vehicle type<input value={form.vehicle_type} onChange={e => setForm({ ...form, vehicle_type: e.target.value })} required /></label><label>Fuel type<select value={form.fuel_type} onChange={e => setForm({ ...form, fuel_type: e.target.value })}><option>Diesel</option><option>Petrol</option><option>Other</option></select></label><label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as TruckInput['status'] })}><option>Active</option><option>Inactive</option></select></label>
        <div className="vehicle-form-actions"><button type="button" className="secondary" onClick={closeForm} disabled={busy}>Cancel</button><button disabled={busy}>{busy ? 'Saving…' : editing ? 'Save Changes' : 'Add Vehicle'}</button></div></form>
    </dialog>}
  </div>
}

export function FuelPrices() {
  const [prices, setPrices] = useState<Price[]>([])
  const [rows, setRows] = useState<ExtractedPrice[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [supplier, setSupplier] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [priceQuery, setPriceQuery] = useState('')
  const [priceDate, setPriceDate] = useState('')
  const [lowestFirst, setLowestFirst] = useState(false)
  const [page, setPage] = useState(0)
  const [pricePage, setPricePage] = useState(0)
  const [loadingPrices, setLoadingPrices] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { message: success, setMessage: setSuccess } = useToast()
  const visiblePrices = useMemo(() => prices.filter(p => p.name.toLowerCase().includes(priceQuery.toLowerCase()) && (!priceDate || p.verified_at === priceDate)).sort((a, b) => lowestFirst ? Number(a.your_price) - Number(b.your_price) : a.name.localeCompare(b.name)), [prices, priceQuery, priceDate, lowestFirst])
  useEffect(() => setPricePage(0), [priceQuery, priceDate, lowestFirst])
  useEffect(() => { void api.prices().then(result => setPrices(result.rows)).catch(error => setError(error.message)).finally(() => setLoadingPrices(false)) }, [])
  async function extract() {
    if (!file) { setError('Choose a PDF first.'); return }
    if (file.size > 10 * 1024 * 1024) { setError('PDF must be 10 MB or smaller.'); return }
    setBusy(true); setError(''); setSuccess('')
    try { const result = await api.extractPrices(file); setRows(result.rows.map(row => ({ ...row, effective_date: effectiveDate }))); setPage(0) }
    catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  async function approve() {
    setBusy(true); setError(''); setSuccess('')
    try { const result = await api.approvePrices(rows, supplier); setSuccess(`${result.saved_count} price rows saved.`); setRows([]); setPrices((await api.prices()).rows) }
    catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  function edit(index: number, key: keyof ExtractedPrice, value: string) {
    setRows(previous => previous.map((row, current) => current === index ? { ...row, [key]: value } : row))
  }
  return <div className="module-page fuel-prices-page">{error && <Notice>{error}</Notice>}<Toast message={success} />
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">DOCUMENT PROCESSING</span><h2>Upload a pricing PDF</h2></div></div><p className="subtle">Text extraction only. Scanned-image OCR is not implemented. The parser supports the existing pricing document format.</p><div className="button-row"><input type="file" accept=".pdf,application/pdf" aria-label="Pricing PDF" onChange={event => setFile(event.target.files?.[0] || null)} /><input aria-label="Supplier name" placeholder="Supplier (optional)" value={supplier} onChange={e => setSupplier(e.target.value)} /><input aria-label="Effective date" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} /><button disabled={busy} onClick={() => void extract()}>{busy ? 'Working…' : 'Process PDF'}</button></div></section>
    {rows.length > 0 && <section className="panel"><div className="panel-heading"><div><span className="eyebrow">REVIEW REQUIRED</span><h2>Extracted rows ({rows.length})</h2></div></div><p className="subtle">Review every page and correct values before approving. Saving updates matching names or inserts new names in Discounted_Fuel_Price.</p><div className="table-wrap"><table><thead><tr><th>Row</th><th>Name</th><th>Your price</th><th>Saving</th><th>Effective date</th></tr></thead><tbody>{rows.slice(page * 25, page * 25 + 25).map((row, offset) => <tr key={page * 25 + offset}><td>{page * 25 + offset + 1}</td>{(['Name', 'Your Price', 'Saving', 'effective_date'] as const).map(key => <td key={key}><input className="table-input" aria-label={`${key} row ${page * 25 + offset + 1}`} value={row[key] || ''} onChange={event => edit(page * 25 + offset, key, event.target.value)} /></td>)}</tr>)}</tbody></table></div><div className="button-row spread"><div className="button-row"><button className="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page + 1} of {Math.ceil(rows.length / 25)}</span><button className="secondary" disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage(page + 1)}>Next</button></div><button disabled={busy} onClick={() => void approve()}>Approve and save all rows</button></div></section>}
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">PRICE DIRECTORY</span><h2>Recorded Prices <span className="vehicle-count">{visiblePrices.length}</span></h2></div></div><div className="button-row module-tools"><input aria-label="Search stations" placeholder="Search stations" value={priceQuery} onChange={e => setPriceQuery(e.target.value)} /><input aria-label="Filter effective date" type="date" value={priceDate} onChange={e => setPriceDate(e.target.value)} /><button className="secondary" onClick={() => setLowestFirst(!lowestFirst)}>{lowestFirst ? 'Sort by station' : 'Sort lowest price'}</button><button className="secondary" onClick={() => exportCsv('fuel-prices.csv', ['Station', 'Price', 'Saving', 'Effective date'], visiblePrices.map(p => [p.name,p.your_price,p.savings,p.verified_at]))}>Export CSV</button></div>{loadingPrices ? <Empty>Loading prices…</Empty> : visiblePrices.length ? <div className="table-wrap"><table><thead><tr><th>Station</th><th>Fuel price</th><th>Saving</th><th>Effective date</th></tr></thead><tbody>{visiblePrices.slice(pricePage * PAGE_SIZE, (pricePage + 1) * PAGE_SIZE).map((price, index) => <tr key={`${price.name}-${index}`}><td>{price.name}</td><td>{price.your_price ?? '-'}</td><td>{price.savings ?? '-'}</td><td>{price.verified_at || 'Unverified'}</td></tr>)}</tbody></table></div> : <Empty>{error ? 'Unable to load prices.' : prices.length ? 'No prices match these filters.' : 'No database prices available.'}</Empty>}<Pagination total={visiblePrices.length} page={pricePage} onPageChange={setPricePage} /></section>
  </div>
}

function StopList({ stops }: { stops: TripPlan['recommended_stops'] }) {
  return <div className="list-stack">{stops.map((stop, index) => <div className="list-item" key={`${stop.store_number || stop.address}-${index}`}><div><strong>Stop {stop.stop_sequence}: {stop.name || stop.store_number || stop.address}, {stop.city}</strong><small>{n(stop.distance_along_route_km)} km along route · {n(stop.refuel_amount_l, 2)} L to fill</small><small>{stop.fuel_stop_reason}</small></div><span className="pill amber">{stop.fuel_price != null ? `Recorded price ${stop.fuel_price}` : stop.savings_display ? `Recorded saving ${stop.savings_display}` : 'Price unverified'}</span></div>)}</div>
}

export function TripPlanner({ onPlan }: { onPlan: (plan: TripPlan) => void }) {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [form, setForm] = useState<TripInput>({ origin: '', destination: '', truck_name: '', current_fuel_l: 0, reserve_km: 20 })
  const [result, setResult] = useState<TripPlan | null>(null)
  const [calculatedInput, setCalculatedInput] = useState<TripInput | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState<string | null>(null)
  useEffect(() => { void Promise.all([api.trucks(), api.drivers()]).then(([vehicles, people]) => { setTrucks(vehicles); setDrivers(people) }).catch(error => setError(error.message)) }, [])
  const selected = trucks.find(truck => truck.name === form.truck_name)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setResult(null); setSaved(null)
    if (!selected) { setError('Select a registered truck.'); return }
    if (form.current_fuel_l > selected.tank_capacity_l) { setError('Current fuel exceeds this truck’s tank capacity.'); return }
    setBusy(true)
    try { const plan = await api.planTrip(form); setResult(plan); setCalculatedInput({ ...form }); onPlan(plan) }
    catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  async function save() {
    if (!result || !calculatedInput || saved) return
    setBusy(true); setError('')
    try { const response = await api.saveTrip(result, calculatedInput); setSaved(response.trip_record_id || 'saved') }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="module-page trip-planner-page">{error && <Notice>{error}</Notice>}
    <div className="two-column planner-layout"><section className="panel"><div className="panel-heading"><div><span className="eyebrow">NEW PLAN</span><h2>Trip Planner</h2></div></div><form className="form-grid" onSubmit={submit}>
      <label>Driver<select value={form.driver_id || ''} onChange={e => { const driver = drivers.find(d => d.id === Number(e.target.value)); setForm({ ...form, driver_id: driver?.id || null, truck_name: driver?.assigned_vehicle_name || form.truck_name }) }}><option value="">No driver</option>{drivers.filter(d => d.status === 'Active').map(d => <option value={d.id} key={d.id}>{d.name}{d.assigned_vehicle_name ? ` (${d.assigned_vehicle_name})` : ''}</option>)}</select></label>
      <label>Registered truck<select value={form.truck_name} onChange={event => setForm({ ...form, truck_name: event.target.value })} required><option value="">Select a truck</option>{trucks.filter(truck => truck.status === 'Active').map(truck => <option key={truck.id || truck.name} value={truck.name}>{truck.name}</option>)}</select></label>
      {selected && <div className="hint">{n(selected.fuel_average_l, 2)} L/100 km · {n(selected.tank_capacity_l, 2)} L tank</div>}
      <label>Origin<input value={form.origin} onChange={event => setForm({ ...form, origin: event.target.value })} placeholder="City or address" required /></label>
      <label>Destination<input value={form.destination} onChange={event => setForm({ ...form, destination: event.target.value })} placeholder="City or address" required /></label>
      <label>Current fuel (L)<input type="number" min="0" max={selected?.tank_capacity_l} step="0.01" value={form.current_fuel_l} onChange={event => setForm({ ...form, current_fuel_l: Number(event.target.value) })} required /></label>
      <label>Emergency reserve (km)<input type="number" min="0" max="1000" step="1" value={form.reserve_km} onChange={event => setForm({ ...form, reserve_km: Number(event.target.value) })} required /></label>
      <div className="hint">The original planner used a 20 km reserve. Set this trip’s reserve explicitly.</div><button disabled={busy || !trucks.length}>{busy ? 'Calculating route…' : 'Calculate Trip'}</button>
    </form></section><section className="panel map-card"><div className="panel-heading"><div><span className="eyebrow">ROUTE</span><h2>Map preview</h2></div></div><MapPanel plan={result} />{!result && <p className="subtle">Enter a trip to display its route on this map.</p>}</section></div>
    {result && <div className="trip-result"><section className={`panel trip-status ${result.fuel_status.startsWith('Sufficient') ? 'safe' : 'unsafe'}`}><div className="panel-heading"><div><span className="eyebrow">FUEL STATUS</span><h2>{result.fuel_status}</h2></div></div><p>{result.fuel_status_message}</p>{result.safety_failure && <Notice>{result.safety_failure.message}</Notice>}</section>
      <div className="metric-grid"><div className="metric"><span>Distance</span><strong>{n(result.distance_km)} <em>km</em></strong></div><div className="metric"><span>Estimated time</span><strong>{n(result.duration_seconds / 3600)} <em>h</em></strong></div><div className="metric"><span>Required fuel</span><strong>{n(result.fuel_required_l, 2)} <em>L</em></strong></div><div className="metric"><span>Current fuel</span><strong>{n(result.current_fuel_l, 2)} <em>L</em></strong></div><div className="metric"><span>Remaining fuel</span><strong>{n(result.remaining_fuel_l, 2)} <em>L</em></strong></div><div className="metric"><span>Reserve fuel</span><strong>{n(result.reserve_fuel_l, 2)} <em>L</em></strong></div><div className="metric"><span>Safe range</span><strong>{n(result.safe_operating_range_km)} <em>km</em></strong></div></div>
      <section className="panel"><div className="panel-heading"><div><span className="eyebrow">ALONG THE ROUTE</span><h2>Recommended fuel stops</h2></div></div><p className="subtle">Station savings and prices are from existing database records. Freshness and availability are unverified.</p>{result.recommended_stops.length ? <StopList stops={result.recommended_stops} /> : <Empty>No refuelling stops were recommended.</Empty>}</section>
      <div className="button-row trip-actions"><button disabled={busy || !!saved} onClick={() => void save()}>{saved ? `Saved trip ${saved}` : 'Save Trip'}</button><button className="secondary" onClick={() => window.print()}>Print Trip Summary</button><button className="secondary" onClick={() => document.querySelector('.route-map')?.scrollIntoView()}>View Route Map</button><button className="secondary" onClick={() => { setResult(null); setCalculatedInput(null); setSaved(null); setForm({ origin: '', destination: '', truck_name: '', current_fuel_l: 0, reserve_km: 20 }) }}>Reset Form</button></div>
    </div>}
  </div>
}

export function TripHistory() {
  const [rows, setRows] = useState<TripRecord[]>([])
  const [total, setTotal] = useState(0)
  const [estimatedFuel, setEstimatedFuel] = useState(0)
  const [query, setQuery] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [driver, setDriver] = useState('')
  const [status, setStatus] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => { void api.trips().then(result => { setRows(result.rows); setTotal(result.count); setEstimatedFuel(result.estimated_fuel_l) }).catch(error => setError(error.message)).finally(() => setLoading(false)) }, [])
  const filtered = useMemo(() => rows.filter(row => `${row.id || ''} ${row.origin} ${row.destination} ${row.truck_name} ${row.date}`.toLowerCase().includes(query.toLowerCase()) && (!vehicle || row.truck_name === vehicle) && (!driver || row.driver_name === driver) && (!status || row.fuel_status === status) && (!from || row.date >= from) && (!to || row.date <= to)), [rows, query, vehicle, driver, status, from, to])
  useEffect(() => setPage(0), [query, vehicle, driver, status, from, to])
  return <div className="module-page fuel-records-page">{error && <Notice>{error}</Notice>}
    <div className="metric-grid"><div className="metric"><span>Total trips</span><strong>{total}</strong></div><div className="metric"><span>Estimated fuel consumption</span><strong>{n(estimatedFuel, 2)} L</strong></div><div className="metric"><span>Total distance</span><strong>{n(rows.reduce((sum, row) => sum + row.distance_km, 0))} km</strong></div><div className="metric"><span>Stored trip records</span><strong>{rows.length}</strong></div></div>
    <div className="button-row module-tools"><select aria-label="Filter vehicle" value={vehicle} onChange={e => setVehicle(e.target.value)}><option value="">All vehicles</option>{[...new Set(rows.map(r => r.truck_name))].map(v => <option key={v}>{v}</option>)}</select><select aria-label="Filter driver" value={driver} onChange={e => setDriver(e.target.value)}><option value="">All drivers</option>{[...new Set(rows.map(r => r.driver_name).filter((v): v is string => !!v))].map(v => <option key={v}>{v}</option>)}</select><select aria-label="Filter fuel status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{[...new Set(rows.map(r => r.fuel_status).filter((v): v is string => !!v))].map(v => <option key={v}>{v}</option>)}</select><input aria-label="From date" type="date" value={from} onChange={e => setFrom(e.target.value)} /><input aria-label="To date" type="date" value={to} onChange={e => setTo(e.target.value)} /><button className="secondary" onClick={() => exportCsv('fuel-records.csv', ['ID','Vehicle','Driver','Origin','Destination','KM','Current L','Required L','Duration','Status','Date'], filtered.map(r => [r.id,r.truck_name,r.driver_name,r.origin,r.destination,r.distance_km,r.current_fuel_l,r.fuel_required_l,r.required_time,r.fuel_status,r.date]))}>Export CSV</button></div>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">TRIP DIRECTORY</span><h2>Fuel Records <span className="vehicle-count">{filtered.length}</span></h2></div><input className="search" aria-label="Search trips" placeholder="Search ID, route, or vehicle" value={query} onChange={event => setQuery(event.target.value)} /></div>{loading ? <Empty>Loading trip records…</Empty> : filtered.length ? <TripTable rows={filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)} details /> : <Empty>{error ? 'Unable to load trip records.' : rows.length ? 'No trips match these filters.' : 'No trips have been saved yet.'}</Empty>}<Pagination total={filtered.length} page={page} onPageChange={setPage} />{total > rows.length && <p className="subtle">Showing the most recent {rows.length} records.</p>}</section>
  </div>
}

export function Settings() {
  const [apiState, setApiState] = useState('Checking…')
  const [dbState, setDbState] = useState('Checking…')
  useEffect(() => { void api.health().then(() => setApiState('Connected')).catch(() => setApiState('Unavailable')); void api.databaseHealth().then(() => setDbState('Connected')).catch(() => setDbState('Unavailable')) }, [])
  return <><Header title="Settings" subtitle="Local connection status and configuration needed for live data." />
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">SYSTEM</span><h2>Connection status</h2></div></div><div className="list-stack"><div className="list-item"><strong>FastAPI backend</strong><span>{apiState}</span></div><div className="list-item"><strong>SQL Server</strong><span>{dbState}</span></div><div className="list-item"><strong>API address</strong><code>{API_BASE}</code></div></div></section>
    <section className="panel"><h2>Local configuration</h2><p>Set SQL Server values and <code>GOOGLE_MAPS_API_KEY</code> in your local <code>backend/.env</code>. This file is ignored by Git. Use a Google Maps demo key for local testing; use separate restricted server and browser keys with billing for production.</p></section>
  </>
}
