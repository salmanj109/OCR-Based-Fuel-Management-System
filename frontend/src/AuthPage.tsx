import { useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api, type AuthSession } from './api'

type Mode = 'login' | 'signup'

export default function AuthPage({ mode, onAuthenticated }: {
  mode: Mode
  onAuthenticated: (session: AuthSession) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isSignup = mode === 'signup'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (isSignup && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const session = isSignup
        ? await api.signup(name.trim(), email.trim(), password)
        : await api.login(email.trim(), password)
      onAuthenticated(session)
      const destination = (location.state as { from?: string } | null)?.from || '/'
      navigate(destination, { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to continue. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="auth-screen">
    <section className="auth-intro" aria-label="Application introduction">
      <div className="auth-brand"><span className="brand-mark">F</span><div><strong>Fuel Management</strong><small>OPERATIONS SYSTEM</small></div></div>
      <div className="auth-intro-copy"><span className="auth-kicker">OCR BASED FUEL MANAGEMENT</span><h1>One place for your fleet and fuel plans.</h1><p>Review pricing documents, manage trucks, and plan trips with your team.</p></div>
      <span className="auth-project-label">FINAL YEAR PROJECT</span>
    </section>
    <main className="auth-main"><div className="auth-card">
      <span className="eyebrow">TEAM ACCESS</span>
      <h2>{isSignup ? 'Create your account' : 'Welcome back'}</h2>
      <p>{isSignup ? 'Use your own account to access the project.' : 'Sign in to continue to your workspace.'}</p>
      {error && <div className="notice error" role="alert">{error}</div>}
      <form className="auth-form" onSubmit={submit}>
        {isSignup && <label>Full name<input type="text" autoComplete="name" value={name} onChange={event => setName(event.target.value)} maxLength={120} required /></label>}
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required /></label>
        <label>Password<input type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} minLength={isSignup ? 12 : 1} maxLength={128} required /></label>
        {isSignup && <><span className="auth-help">Use at least 12 characters.</span><label>Confirm password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} minLength={12} maxLength={128} required /></label></>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}</button>
      </form>
      <p className="auth-switch">{isSignup ? 'Already have an account?' : 'New to the project?'} <Link to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Sign in' : 'Create an account'}</Link></p>
    </div></main>
  </div>
}
