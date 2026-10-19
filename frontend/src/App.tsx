import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AuthPage from './AuthPage'
import { ApiError, api, setCsrfToken, type AuthSession, type TripPlan } from './api'
import { Dashboard, FuelPrices, FuelStops, Settings, TripHistory, TripPlanner, TruckRegistry } from './Pages'

const navigation = [
  ['/', 'Dashboard'], ['/fuel-prices', 'Fuel Prices'], ['/trucks', 'Truck Registry'],
  ['/trip-planner', 'Trip Planner'], ['/fuel-stops', 'Fuel Stops'],
  ['/trip-history', 'Trip History'], ['/settings', 'Settings'],
] as const

function Workspace({ session, onSignOut }: { session: AuthSession | null; onSignOut: () => Promise<void> }) {
  const location = useLocation()
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">F</span><div><strong>Fuel Management</strong><small>OPERATIONS SYSTEM</small></div></div>
      <nav aria-label="Main navigation">{navigation.map(([path, label], index) =>
        <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span>{String(index + 1).padStart(2, '0')}</span>{label}
        </NavLink>)}</nav>
      <div className="sidebar-footer"><span className="status-dot" /> Signed in as {session.user.name}</div>
    </aside>
    <div className="main-area"><header className="topbar"><span>OCR Based Fuel Management System</span><div className="topbar-actions"><span className="topbar-user">{session.user.name}</span><button className="topbar-signout" onClick={() => void onSignOut()}>Sign out</button></div></header>
      <main className="content"><Outlet /></main>
    </div>
  </div>
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [checkingSession, setCheckingSession] = useState(true)
  const [latestPlan, setLatestPlan] = useState<TripPlan | null>(null)
  const [signOutError, setSignOutError] = useState('')

  useEffect(() => {
    let active = true
    void api.me().then(current => {
      if (active) { setSession(current); setCsrfToken(current.csrf_token) }
    }).catch(() => {
      if (active) { setSession(null); setCsrfToken(null) }
    }).finally(() => { if (active) setCheckingSession(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const expired = () => { setSession(null); setLatestPlan(null); setCsrfToken(null) }
    window.addEventListener('fuel-session-expired', expired)
    return () => window.removeEventListener('fuel-session-expired', expired)
  }, [])

  function authenticated(current: AuthSession) {
    setSession(current)
    setCsrfToken(current.csrf_token)
    setSignOutError('')
  }

  async function signOut() {
    setSignOutError('')
    try {
      await api.logout()
      setSession(null)
      setCsrfToken(null)
      setLatestPlan(null)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setSession(null)
        setCsrfToken(null)
        setLatestPlan(null)
        return
      }
      setSignOutError(error instanceof Error ? error.message : 'Unable to sign out. Try again.')
    }
  }

  return <BrowserRouter>{checkingSession ? <div className="auth-loading">Checking your session…</div> : <>
    {signOutError && <div className="global-error" role="alert">{signOutError}</div>}
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <AuthPage key="login" mode="login" onAuthenticated={authenticated} />} />
      <Route path="/signup" element={session ? <Navigate to="/" replace /> : <AuthPage key="signup" mode="signup" onAuthenticated={authenticated} />} />
      <Route element={<Workspace session={session} onSignOut={signOut} />}>
        <Route path="/" element={<Dashboard plan={latestPlan} />} />
        <Route path="/fuel-prices" element={<FuelPrices />} />
        <Route path="/trucks" element={<TruckRegistry />} />
        <Route path="/trip-planner" element={<TripPlanner onPlan={setLatestPlan} />} />
        <Route path="/fuel-stops" element={<FuelStops plan={latestPlan} />} />
        <Route path="/trip-history" element={<TripHistory />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>}</BrowserRouter>
}

export default App
