import { useState } from 'react'
import type { AuthUser } from './api'

export default function UsersRolesPage({ user }: { user: AuthUser }) {
  const [notice, setNotice] = useState('')

  return <section className="users-page" aria-labelledby="users-title">
    <div className="users-card">
      <header className="users-heading">
        <h1 id="users-title">Username</h1>
        <button className="users-create" onClick={() => setNotice('User creation is not available yet.')}>Create User</button>
      </header>
      {notice && <div className="users-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}
      <div className="users-table-wrap">
        <table className="users-table">
          <thead><tr><th scope="col">#</th><th scope="col">Username</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Active</th><th scope="col">Permissions</th><th scope="col">Actions</th></tr></thead>
          <tbody><tr>
            <td>1</td>
            <td className="users-name">{user.name}</td>
            <td><div className="users-email"><img src={`${import.meta.env.BASE_URL}auth/rocket-badge.png`} alt="" /><span>{user.email}</span></div></td>
            <td>User</td>
            <td><span className="users-status">Active</span></td>
            <td><button className="users-manage" onClick={() => setNotice('Permission management is not available yet.')}>Manage</button></td>
            <td><button className="users-edit" aria-label={`Edit ${user.name}`} title="Edit user" onClick={() => setNotice('User editing is not available yet.')}>Edit</button></td>
          </tr></tbody>
        </table>
      </div>
      <nav className="users-pagination" aria-label="User pages">
        <button aria-label="First page" disabled>«</button>
        <button aria-label="Previous page" disabled>‹</button>
        <span aria-current="page">1</span>
        <button aria-label="Next page" disabled>›</button>
        <button aria-label="Last page" disabled>»</button>
      </nav>
    </div>
  </section>
}
