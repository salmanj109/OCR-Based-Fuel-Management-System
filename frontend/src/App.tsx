import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AuthPage from './AuthPage'
import Dashboard from './Dashboard'
import PasswordRecoveryPage from './PasswordRecoveryPage'
import UsersRolesPage from './UsersRolesPage'
import { ApiError, api, setCsrfToken, type AuthSession, type AuthUser, type TripPlan } from './api'
import { FuelPrices, FuelStops, Settings, TripHistory, TripPlanner, TruckRegistry } from './Pages'

const navigation = [
  ['/', 'Dashboard', 'layout-dashboard'], ['/trucks', 'Vehicles', 'truck'], ['/drivers', 'Drivers', 'users'],
  ['/fuel-prices', 'Fuel Prices', 'gas-station'], ['/trip-planner', 'Trip Planner', 'route'],
  ['/trip-history', 'Fuel Records', 'receipt'], ['/fuel-stops', 'Fuel Stops', 'map-pin'],
  ['/ai-assistant', 'AI Assistant', 'robot'], ['/alerts', 'Alerts', 'bell'], ['/reports', 'Reports', 'chart-bar'],
  ['/users-roles', 'Users & Roles', 'user-shield'], ['/settings', 'Settings', 'settings'],
] as const

const pendingFeatures = {
  Drivers: 'Driver profiles and assignments are not stored by the current backend yet.',
  'AI Assistant': 'AI assistance is planned. Trip planning and fuel calculations are available now.',
  Alerts: 'The current trip plan can show fuel safety alerts on the dashboard. Saved alert history is not available yet.',
  Reports: 'Historical reporting needs more saved cost and consumption data. Trip history is available now.',
} as const

function FeaturePage({ title }: { title: keyof typeof pendingFeatures }) {
  return <div className="feature-page"><div className="feature-card"><span className="eyebrow">COMING SOON</span><h1>{title}</h1><p>{pendingFeatures[title]}</p><div className="button-row"><Link className="button" to="/">Back to Dashboard</Link><Link className="button secondary" to="/trip-planner">Plan a Trip</Link></div></div></div>
}

function ProfilePage({ user }: { user: AuthUser }) {
  return <section className="profile-page" aria-labelledby="profile-title">
    <header className="profile-page-heading"><h1 id="profile-title">Profile</h1></header>
    <div className="profile-page-body">
      <div className="profile-identity">
        <img className="profile-identity-avatar" src={`${import.meta.env.BASE_URL}auth/rocket-badge.png`} alt="" />
        <div><strong>{user.name}</strong><span>{user.email}</span></div>
      </div>
      <dl className="profile-fields">
        <div><dt>Username</dt><dd>{user.name}</dd></div>
        <div><dt>Role</dt><dd>User</dd></div>
        <div><dt>Email</dt><dd>{user.email}</dd></div>
        <div><dt>Status</dt><dd>Active</dd></div>
      </dl>
    </div>
  </section>
}

function MenuIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg> }
function GlobeIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c-3 3-4 6-4 9s1 6 4 9M12 3c3 3 4 6 4 9s-1 6-4 9" /></svg> }
function BellIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg> }
function ProfileMenuIcon({ name }: { name: 'profile' | 'notifications' | 'pricing' | 'help' | 'lock' | 'logout' }) {
  const shapes = {
    profile: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="9" r="2.5" /><path d="M7.5 18c.7-2.2 2.2-3.3 4.5-3.3s3.8 1.1 4.5 3.3" /></>,
    notifications: <><path d="M4 5.5h16v11H9l-4 3v-3H4z" /><path d="M8 10h8M8 13h5" /></>,
    pricing: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M7 15h4" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.4 1.6c-.6.6-1.9 1.2-1.9 2.5M12 16.5h.01" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
    logout: <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h10" /></>,
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true">{shapes[name]}</svg>
}
function NavIcon({ name }: { name: string }) {
  const image = `url("${import.meta.env.BASE_URL}icons/sidebar/${name}.svg")`
  return <span className="nav-icon" style={{ maskImage: image, WebkitMaskImage: image }} aria-hidden="true" />
}

function Workspace({ session, onSignOut, plan }: { session: AuthSession | null; onSignOut: () => Promise<void>; plan: TripPlan | null }) {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showLanguage, setShowLanguage] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showProfile) return
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setShowProfile(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowProfile(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [showProfile])
  if (!session) return <Navigate to="/login" state={{ from: location.pathname }} replace />

  return <div className={`app-shell${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
    <aside className="sidebar" id="workspace-sidebar">
      <Link className="brand" to="/" aria-label="Flevio home"><span className="brand-mark">F</span><div><strong>Flevio</strong><small>FUEL OPERATIONS</small></div></Link>
      <nav aria-label="Main navigation">{navigation.map(([path, label, icon]) =>
        <NavLink key={path} to={path} end={path === '/'} aria-label={label} title={sidebarOpen ? undefined : label} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <NavIcon name={icon} /><span className="nav-label">{label}</span>
        </NavLink>)}</nav>
      <div className="sidebar-footer"><button className="sidebar-logout" aria-label="Log out" title={sidebarOpen ? undefined : 'Log out'} onClick={() => void onSignOut()}><NavIcon name="logout" /><span className="logout-label">Log out</span></button></div>
    </aside>
    <div className="main-area"><header className="topbar">
      <div className="topbar-leading"><button className="topbar-menu" aria-label={sidebarOpen ? 'Collapse navigation' : 'Expand navigation'} aria-controls="workspace-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><MenuIcon /></button><span className="topbar-welcome">Welcome <strong>Flevio</strong>!</span></div>
      <div className="topbar-actions">
        <div className="topbar-popover-anchor"><button className="topbar-language" aria-label="Language: English (UK)" aria-expanded={showLanguage} aria-haspopup="menu" onClick={() => { setShowLanguage(!showLanguage); setShowAlerts(false); setShowProfile(false) }}><GlobeIcon /><span>en</span></button>{showLanguage && <div className="topbar-popover language-popover" role="menu" aria-label="Language"><button className="language-option" role="menuitem" onClick={() => setShowLanguage(false)}>English (UK)</button></div>}</div>
        <div className="topbar-popover-anchor"><button className="topbar-alert-button" aria-label="Alerts" aria-expanded={showAlerts} onClick={() => { setShowAlerts(!showAlerts); setShowProfile(false); setShowLanguage(false) }}><BellIcon />{plan?.safety_failure && <span className="alert-badge" />}</button>{showAlerts && <div className="topbar-popover"><strong>Fuel alerts</strong><p>{plan?.safety_failure?.message || 'No active route alerts. Plan a trip to check fuel safety.'}</p><Link to="/alerts" onClick={() => setShowAlerts(false)}>Open alerts</Link></div>}</div>
        <div className="topbar-popover-anchor" ref={profileMenuRef}>
          <button className="topbar-profile" aria-label="Account menu" aria-expanded={showProfile} aria-haspopup="menu" onClick={() => { setShowProfile(!showProfile); setShowAlerts(false); setShowLanguage(false) }}>
            <span className="profile-avatar">{session.user.name.trim().charAt(0).toUpperCase()}</span>
          </button>
          {showProfile && <div className="topbar-popover profile-popover" role="menu" aria-label="Account">
            <div className="profile-menu-welcome">Welcome {session.user.name.trim().split(/\s+/)[0]}!</div>
            <Link className="profile-menu-item" role="menuitem" to="/profile" onClick={() => setShowProfile(false)}><ProfileMenuIcon name="profile" />Profile</Link>
            <Link className="profile-menu-item" role="menuitem" to="/alerts" onClick={() => setShowProfile(false)}><ProfileMenuIcon name="notifications" />Notifications</Link>
            <Link className="profile-menu-item" role="menuitem" to="/fuel-prices" onClick={() => setShowProfile(false)}><ProfileMenuIcon name="pricing" />Pricing</Link>
            <Link className="profile-menu-item" role="menuitem" to="/help" onClick={() => setShowProfile(false)}><ProfileMenuIcon name="help" />Help</Link>
            <button className="profile-menu-item" role="menuitem" onClick={() => void onSignOut()}><ProfileMenuIcon name="lock" />Lock Screen</button>
            <div className="profile-menu-divider" />
            <button className="profile-menu-item profile-menu-logout" role="menuitem" onClick={() => void onSignOut()}><ProfileMenuIcon name="logout" />Logout</button>
          </div>}
        </div>
      </div>
    </header>
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
      <Route path="/forgot-password" element={<PasswordRecoveryPage mode="forgot" />} />
      <Route path="/reset-password" element={<PasswordRecoveryPage mode="reset" onReset={() => { setSession(null); setCsrfToken(null); setLatestPlan(null) }} />} />
      <Route element={<Workspace session={session} onSignOut={signOut} plan={latestPlan} />}>
        <Route path="/" element={<Dashboard plan={latestPlan} name={session?.user.name || 'there'} />} />
        <Route path="/profile" element={session ? <ProfilePage user={session.user} /> : null} />
        <Route path="/help" element={<div className="account-page"><h1>Help</h1><div className="account-card"><p>Use the sidebar to manage vehicles, check fuel prices, and plan trips.</p><Link to="/trip-planner">Plan a trip</Link><Link to="/settings">Check connection settings</Link></div></div>} />
        <Route path="/fuel-prices" element={<FuelPrices />} />
        <Route path="/trucks" element={<TruckRegistry />} />
        <Route path="/trip-planner" element={<TripPlanner onPlan={setLatestPlan} />} />
        <Route path="/fuel-stops" element={<FuelStops plan={latestPlan} />} />
        <Route path="/trip-history" element={<TripHistory />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/drivers" element={<FeaturePage title="Drivers" />} />
        <Route path="/ai-assistant" element={<FeaturePage title="AI Assistant" />} />
        <Route path="/alerts" element={<FeaturePage title="Alerts" />} />
        <Route path="/reports" element={<FeaturePage title="Reports" />} />
        <Route path="/users-roles" element={session ? <UsersRolesPage user={session.user} /> : null} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>}</BrowserRouter>
}

export default App
