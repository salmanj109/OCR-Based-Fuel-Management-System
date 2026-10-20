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
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const isSignup = mode === 'signup'

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
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

  return <div className="spacer-auth-screen">
    <div className="spacer-auth-layout">
      <section className="spacer-auth-intro" aria-label="Application introduction">
        <div className="spacer-auth-intro-content">
          <p className="spacer-auth-welcome">Welcome to</p>
          <div className="spacer-auth-brand">
            <img src="/auth/rocket-badge.png" alt="" width="82" height="82" />
            <span>Flevio</span>
          </div>
          <p className="spacer-auth-tagline">Smarter Fuel. Smarter Fleets.</p>
          <p className="spacer-auth-description">Transform fuel data into smarter decisions. <br /> Manage fuel prices, optimize routes, and keep every journey efficient all in one place.</p>
        </div>
        <div className="spacer-auth-footer" aria-hidden="true"><span>FUEL OPERATIONS</span><span>OCR MANAGEMENT</span></div>
      </section>

      <main className="spacer-auth-main">
        <div className="spacer-auth-content">
          <h1>{isSignup ? 'Create your account' : 'Sign in to your account'}</h1>
          {error && <div className="notice error" role="alert">{error}</div>}
          <form className="spacer-auth-form" onSubmit={submit}>
            {isSignup && <label className="spacer-auth-field">
              <span>Name</span>
              <input type="text" autoComplete="name" placeholder="Enter your name" value={name} onChange={event => setName(event.target.value)} maxLength={120} required />
            </label>}
            <label className="spacer-auth-field">
              <span>E-mail Address</span>
              <input type="email" autoComplete="email" placeholder="Enter your e-mail" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} required />
            </label>
            <label className="spacer-auth-field">
              <span>Password</span>
              <input type="password" autoComplete={isSignup ? 'new-password' : 'current-password'} placeholder="Enter your password" value={password} onChange={event => setPassword(event.target.value)} minLength={isSignup ? 12 : 1} maxLength={128} required />
            </label>
            {isSignup ? <label className="spacer-auth-terms">
              <input type="checkbox" checked={acceptedTerms} onChange={event => setAcceptedTerms(event.target.checked)} required />
              <span>By signing up, I agree to the Terms &amp; Conditions.</span>
            </label> : <Link className="spacer-auth-forgot" to="/forgot-password">Forgot password?</Link>}
            <div className="spacer-auth-actions">
              <button type="submit" className="spacer-auth-primary" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Sign Up' : 'Sign In'}</button>
              <Link className="spacer-auth-secondary" to={isSignup ? '/login' : '/signup'}>{isSignup ? 'Sign In' : 'Sign Up'}</Link>
            </div>
          </form>
        </div>
      </main>
    </div>
  </div>
}
