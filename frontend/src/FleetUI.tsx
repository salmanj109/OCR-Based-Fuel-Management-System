import { useEffect, useState } from 'react'
import IconifyIcon from './IconifyIcon'

export const PAGE_SIZE = 10

export function Pagination({ total, page, onPageChange, pageSize = PAGE_SIZE }: {
  total: number
  page: number
  onPageChange: (page: number) => void
  pageSize?: number
}) {
  if (total <= pageSize) return null
  const pages = Math.ceil(total / pageSize)
  return <nav className="fleet-pagination" aria-label="Table pages">
    <span>Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}</span>
    <div><button className="secondary" disabled={page === 0} onClick={() => onPageChange(page - 1)}>Previous</button><span>Page {page + 1} of {pages}</span><button className="secondary" disabled={page >= pages - 1} onClick={() => onPageChange(page + 1)}>Next</button></div>
  </nav>
}

export function useToast() {
  const [message, setMessage] = useState('')
  useEffect(() => {
    if (!message) return
    const timeout = window.setTimeout(() => setMessage(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [message])
  return { message, setMessage }
}

export function Toast({ message }: { message: string }) {
  return message ? <div className="fleet-toast" role="status">{message}</div> : null
}

export function RowActions({ name, busy, onEdit, onDelete }: {
  name: string
  busy?: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return <div className="fleet-row-actions">
    <button type="button" className="fleet-edit" title={`Edit ${name}`} aria-label={`Edit ${name}`} onClick={onEdit}><IconifyIcon name="edit" size={17} /></button>
    <button type="button" className="fleet-delete danger" title={`Delete ${name}`} aria-label={`Delete ${name}`} disabled={busy} onClick={onDelete}><IconifyIcon name="trash" size={17} /></button>
  </div>
}
