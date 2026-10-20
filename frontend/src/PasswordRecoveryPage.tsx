import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from './api'

type Mode = 'forgot' | 'reset'

export default function PasswordRecoveryPage({ mode, onReset }: { mode: Mode; onReset?: () => void }) {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  const isReset = mode === 'reset'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (isReset && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      if (isReset) {
        const result = await api.resetPassword(token, password)
        setSuccess(result.message)
        setPassword('')
        setConfirmPassword('')
        onReset?.()
      } else {
        const result = await api.forgotPassword(email.trim())
        setSuccess(result.message)
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to continue. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="auth-screen">
    <section className="auth-intro" aria-label="Application introduction">
      <div className="auth-brand"><span className="brand-mark">F</span><div><strong>Flevio</strong><small>FUEL OPERATIONS</small></div></div>
      <div className="auth-intro-copy"><span className="auth-kicker">ACCOUNT RECOVERY</span><h1>Get back to your workspace.</h1><p>Reset your password securely and continue managing your fleet and fuel plans.</p></div>
      <span className="auth-project-label">FINAL YEAR PROJECT</span>
    </section>
    <main className="auth-main"><div className="auth-card">
      <span className="eyebrow">TEAM ACCESS</span>
      <h2>{isReset ? 'Set a new password' : 'Forgot password?'}</h2>
      <p>{isReset ? 'Choose a new password for your Flevio account.' : 'Enter your account email and we will send you a reset link.'}</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      {success ? <div className="notice success" role="status">{success}</div> : isReset && !token ?
        <div className="notice error" role="alert">This reset link is missing its token. Request a new link.</div> :
        <form className="auth-form" onSubmit={submit}>
          {isReset ? <>
            <label>New password<input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={12} maxLength={128} required /></label>
            <span className="auth-help">Use at least 12 characters.</span>
            <label>Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required /></label>
          </> : <label>Email address<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required /></label>}
          <button type="submit" disabled={busy}>{busy ? 'Please wait…' : isReset ? 'Update password' : 'Send reset link'}</button>
        </form>}
      {!isReset && <p className="auth-local-help">For local development, a maintainer can reset your password in the backend terminal with <code>python reset_password.py</code>.</p>}
      <p className="auth-switch"><Link to="/login">Back to sign in</Link></p>
    </div></main>
  </div>
}
