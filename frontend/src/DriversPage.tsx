import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, type Driver, type DriverInput, type Truck } from './api'
import ConfirmDeleteDialog from './ConfirmDeleteDialog'
import { PAGE_SIZE, Pagination, RowActions, Toast, useToast } from './FleetUI'

const blank: DriverInput = { name: '', phone: '', email: '', national_id: '', license_number: '', license_expiry_date: null, assigned_vehicle_name: null, address: '', status: 'Active' }

export default function DriversPage({ readOnly = false }: { readOnly?: boolean }) {
  const [rows, setRows] = useState<Driver[]>([])
  const [vehicles, setVehicles] = useState<Truck[]>([])
  const [form, setForm] = useState<DriverInput>(blank)
  const [editing, setEditing] = useState<number | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Driver | null>(null)
  const { message, setMessage } = useToast()
  const [page, setPage] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const load = async () => { const [drivers, trucks] = await Promise.all([api.drivers(), api.trucks()]); setRows(drivers); setVehicles(trucks) }
  useEffect(() => { void load().catch(e => setError(e.message)).finally(() => setLoading(false)) }, [])
  const filtered = useMemo(() => rows.filter(d => (!status || d.status === status) && `${d.name} ${d.phone} ${d.license_number} ${d.assigned_vehicle_name || ''}`.toLowerCase().includes(query.toLowerCase())), [rows, query, status])
  useEffect(() => setPage(0), [query, status])
  useEffect(() => { if (page > 0 && page * PAGE_SIZE >= filtered.length) setPage(Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1)) }, [filtered.length, page])
  async function save(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    try { if (editing !== null) await api.editDriver(editing, form); else await api.addDriver(form); await load(); setOpen(false); setMessage('Driver saved.'); setEditing(null) }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  async function remove(driver: Driver) {
    setBusy(true); setError('')
    try { await api.deleteDriver(driver.id); await load(); setMessage('Driver deleted.') }
    catch (e) { setError((e as Error).message) } finally { setBusy(false); setPendingDelete(null) }
  }
  return <div className="module-page drivers-page">
    {error && <div className="notice error" role="alert">{error}</div>}<Toast message={message} />
    <section className="module-card"><div className="module-card-heading"><div><span className="eyebrow">FLEET DIRECTORY</span><h2>Driver List <span className="vehicle-count">{filtered.length}</span></h2><p>Manage driver profiles and vehicle assignments.</p></div>{!readOnly && <button onClick={() => { setForm(blank); setEditing(null); setOpen(true); setError('') }}>+ Add Driver</button>}</div>
      <div className="module-toolbar"><input aria-label="Search drivers" placeholder="Search drivers, phone or license..." value={query} onChange={e => setQuery(e.target.value)} /><select aria-label="Filter driver status" value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option><option>Active</option><option>Inactive</option></select></div>
      {loading ? <div className="module-empty" role="status">Loading drivers…</div> : filtered.length ? <div className="module-table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>License</th><th>Vehicle</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(d => <tr key={d.id}><td><span className="vehicle-identity"><span className="vehicle-avatar" aria-hidden="true">{d.name.trim().charAt(0).toUpperCase()}</span><strong>{d.name}</strong></span></td><td>{d.phone}</td><td>{d.license_number}</td><td>{d.assigned_vehicle_name || 'Unassigned'}</td><td><span className={`vehicle-status ${d.status === 'Active' ? 'is-active' : 'is-inactive'}`}><span aria-hidden="true" />{d.status}</span></td><td>{readOnly ? 'View only' : <RowActions name={d.name} busy={busy} onEdit={() => { setForm({ ...d }); setEditing(d.id); setOpen(true); setError('') }} onDelete={() => setPendingDelete(d)} />}</td></tr>)}</tbody></table></div> : <div className="module-empty">{error ? 'Unable to load drivers.' : rows.length ? 'No drivers match these filters.' : 'No drivers yet. Add a driver to get started.'}</div>}
      <Pagination total={filtered.length} page={page} onPageChange={setPage} />
    </section>
    <ConfirmDeleteDialog name={pendingDelete?.name || null} busy={busy} onCancel={() => setPendingDelete(null)} onConfirm={() => { if (pendingDelete) void remove(pendingDelete) }} />
    {open && <div className="modal-shade"><section className="panel module-modal"><h2>{editing !== null ? 'Edit Driver' : 'Add Driver'}</h2><form className="form-grid" onSubmit={e => void save(e)}>
      <label>Name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label><label>Phone<input required type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></label>
      <label>Email<input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label><label>CNIC / ID<input value={form.national_id} onChange={e => setForm({ ...form, national_id: e.target.value })} /></label>
      <label>License number<input required value={form.license_number} onChange={e => setForm({ ...form, license_number: e.target.value })} /></label><label>License expiry<input type="date" value={form.license_expiry_date || ''} onChange={e => setForm({ ...form, license_expiry_date: e.target.value || null })} /></label>
      <label>Assigned vehicle<select value={form.assigned_vehicle_name || ''} onChange={e => setForm({ ...form, assigned_vehicle_name: e.target.value || null })}><option value="">Unassigned</option>{vehicles.filter(v => v.status === 'Active').map(v => <option key={v.name}>{v.name}</option>)}</select></label>
      <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as DriverInput['status'] })}><option>Active</option><option>Inactive</option></select></label><label>Address<input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></label>
      <div className="button-row"><button disabled={busy}>{busy ? 'Saving…' : 'Save Driver'}</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button></div></form></section></div>}
  </div>
}

