import { useEffect, useState, type FormEvent } from 'react'
import { api, type AuthUser, type Driver, type ManagedUser, type Role } from './api'

// Kept as a normal module so Vite refreshes the user-management screen.

const roles: Role[] = ['Admin', 'Fleet Manager', 'Fuel Coordinator', 'Dispatcher', 'Driver']
export default function UsersRolesPage({ user }: { user: AuthUser }) {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('Dispatcher')
  const [driverId, setDriverId] = useState('')
  const [active, setActive] = useState(true)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { void Promise.all([api.users(), api.drivers()]).then(([accounts, people]) => { setUsers(accounts); setDrivers(people) }).catch(error => setMessage(error.message)) }, [])
  function edit(account: ManagedUser | null) {
    setEditing(account); setName(account?.name || ''); setEmail(account?.email || ''); setPassword('')
    setRole(account?.role || 'Dispatcher'); setDriverId(account?.driver_id?.toString() || '')
    setActive(account?.is_active ?? true); setMessage(''); setOpen(true)
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('')
    try {
      const driver_id = role === 'Driver' && driverId ? Number(driverId) : null
      if (role === 'Driver' && !driver_id) throw new Error('Select a driver profile for this account.')
      const saved = editing ? await api.updateUser(editing.id, { role, driver_id, is_active: active }) : await api.createUser({ name, email, password, role, driver_id })
      setUsers(previous => editing ? previous.map(item => item.id === saved.id ? saved : item) : [...previous, saved])
      setOpen(false); setMessage(editing ? 'User updated.' : 'User created.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save user') }
    finally { setBusy(false) }
  }
  return <section className="users-page"><div className="users-card"><header className="users-heading"><h1>Users &amp; Roles</h1><button className="users-create" onClick={() => edit(null)}>Create User</button></header>
    {message && <div className="users-notice" role="status">{message}</div>}
    <div className="users-table-wrap"><table className="users-table"><thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Driver</th><th>Status</th><th>Actions</th></tr></thead><tbody>{users.map(account => <tr key={account.id}><td className="users-name">{account.name}</td><td>{account.email}</td><td>{account.role}</td><td>{drivers.find(driver => driver.id === account.driver_id)?.name || '—'}</td><td>{account.is_active ? 'Active' : 'Inactive'}</td><td><button className="users-edit" onClick={() => edit(account)}>Edit</button></td></tr>)}</tbody></table>{!users.length && <p>No users found.</p>}</div>
    {open && <div className="fleet-modal-backdrop" role="presentation"><div className="fleet-modal" role="dialog" aria-modal="true" aria-label={editing ? 'Edit user' : 'Create user'}><h2>{editing ? 'Edit user' : 'Create user'}</h2><form onSubmit={save} className="fleet-form"><label>Name<input value={name} onChange={event => setName(event.target.value)} disabled={!!editing} required /></label><label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} disabled={!!editing} required /></label>{!editing && <label>Password<input type="password" minLength={12} value={password} onChange={event => setPassword(event.target.value)} required /></label>}<label>Role<select value={role} onChange={event => setRole(event.target.value as Role)}>{roles.map(value => <option key={value}>{value}</option>)}</select></label>{role === 'Driver' && <label>Driver profile<select required value={driverId} onChange={event => setDriverId(event.target.value)}><option value="">Select driver</option>{drivers.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>}{editing && <label><input type="checkbox" checked={active} disabled={editing.id === user.id} onChange={event => setActive(event.target.checked)} /> Active</label>}<div className="button-row"><button type="submit" className="button" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button><button type="button" className="button secondary" onClick={() => setOpen(false)}>Cancel</button></div></form></div></div>}
  </div></section>
}
