import { useEffect, useRef } from 'react'
import IconifyIcon from './IconifyIcon'

export default function ConfirmDeleteDialog({ name, busy, onCancel, onConfirm }: {
  name: string | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (name && !dialog.current?.open) dialog.current?.showModal()
    if (!name && dialog.current?.open) dialog.current.close()
  }, [name])

  return <dialog ref={dialog} className="confirm-delete-dialog" aria-labelledby="confirm-delete-title"
    onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}
    onClick={event => { if (event.target === dialog.current && !busy) onCancel() }}>
    <div className="confirm-delete-icon"><IconifyIcon name="alert-triangle" size={24} /></div>
    <h2 id="confirm-delete-title">Delete {name}?</h2>
    <p>This action cannot be undone.</p>
    <div className="confirm-delete-actions">
      <button type="button" className="confirm-cancel" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className="danger confirm-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
    </div>
  </dialog>
}
