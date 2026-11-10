import { useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import AuthPage from './AuthPage'
import Dashboard from './Dashboard'
import DriversPage from './DriversPage'
import IconifyIcon from './IconifyIcon'
import PasswordRecoveryPage from './PasswordRecoveryPage'
import UsersRolesPage from './UsersRolesPage'
import { ApiError, api, setCsrfToken, type AuthSession, type AuthUser, type Role, type TripPlan } from './api'
import DriverHome from './DriverHome'
import { AlertsPage, AssistantPage, FuelStopsPage, ReportsPage } from './OperationsPages'
import { FuelPrices, Settings, TripHistory, TripPlanner, TruckRegistry } from './Pages'

const navigation = [
  ['/', 'Dashboard', 'layout-dashboard'], ['/trucks', 'Vehicles', 'truck'], ['/drivers', 'Drivers', 'users'],
  ['/fuel-prices', 'Fuel Prices', 'gas-station'], ['/trip-planner', 'Trip Planner', 'route'],
  ['/trip-history', 'Fuel Records', 'receipt'], ['/fuel-stops', 'Fuel Stops', 'map-pin'],
  ['/ai-assistant', 'AI Assistant', 'robot'], ['/alerts', 'Alerts', 'bell'], ['/reports', 'Reports', 'chart-bar'],
  ['/users-roles', 'Users & Roles', 'user-shield'], ['/settings', 'Settings', 'settings'],
] as const

const navigationGroups = [
  { title: 'OVERVIEW', paths: ['/'] },
  { title: 'FLEET', paths: ['/trucks', '/drivers', '/trip-planner'] },
  { title: 'FUEL OPERATIONS', paths: ['/fuel-prices', '/trip-history', '/fuel-stops'] },
  { title: 'INSIGHTS', paths: ['/ai-assistant', '/alerts', '/reports'] },
  { title: 'ADMINISTRATION', paths: ['/users-roles', '/settings'] },
] as const

const allowedPaths: Record<Role, string[]> = {
  Admin: ['/', '/trucks', '/drivers', '/fuel-prices', '/trip-planner', '/trip-history', '/fuel-stops', '/ai-assistant', '/alerts', '/reports', '/users-roles', '/settings', '/profile', '/help'],
  'Fleet Manager': ['/', '/trucks', '/drivers', '/trip-history', '/fuel-stops', '/ai-assistant', '/alerts', '/reports', '/profile', '/help'],
  'Fuel Coordinator': ['/', '/fuel-prices', '/ai-assistant', '/alerts', '/profile', '/help'],
  Dispatcher: ['/', '/trucks', '/drivers', '/trip-planner', '/trip-history', '/fuel-stops', '/ai-assistant', '/alerts', '/profile', '/help'],
  Driver: ['/', '/my-profile', '/my-vehicle', '/my-trips', '/fuel-instructions', '/trip-history', '/alerts', '/profile', '/help'],
}
const driverNavigation = [
  ['/', 'Dashboard', 'layout-dashboard'], ['/my-profile', 'My Profile', 'users'],
  ['/my-vehicle', 'My Vehicle', 'truck'], ['/my-trips', 'My Trips', 'route'],
  ['/fuel-instructions', 'Fuel Instructions', 'gas-station'], ['/trip-history', 'Trip History', 'receipt'],
] as const
function Protected({ user, path, children }: { user: AuthUser | undefined; path: string; children: React.ReactNode }) {
  return user && allowedPaths[user.role]?.includes(path) ? <>{children}</> : <Navigate to="/" replace />
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
        <div><dt>Role</dt><dd>{user.role}</dd></div>
        <div><dt>Email</dt><dd>{user.email}</dd></div>
        <div><dt>Status</dt><dd>Active</dd></div>
      </dl>
    </div>
  </section>
}

function MenuIcon() { return <IconifyIcon name="menu-2" /> }
function GlobeIcon() { return <IconifyIcon name="world" /> }
function BellIcon() { return <IconifyIcon name="bell" collection="sidebar" /> }
function ProfileMenuIcon({ name }: { name: 'profile' | 'notifications' | 'pricing' | 'help' | 'lock' | 'logout' }) {
  const icons = { profile: 'user-circle', notifications: 'bell', pricing: 'currency-rupee', help: 'help-circle', lock: 'lock', logout: 'logout' } as const
  return <IconifyIcon name={icons[name]} size={15} collection={['notifications', 'pricing', 'logout'].includes(name) ? 'sidebar' : 'ui'} />
}
function NavIcon({ name }: { name: string }) {
  return <IconifyIcon name={name} size={17} collection="sidebar" className="nav-icon" />
}

function Workspace({ session, onSignOut, plan }: { session: AuthSession | null; onSignOut: () => Promise<void>; plan: TripPlan | null }) {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showLanguage, setShowLanguage] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showAlerts, setShowAlerts] = useState(false)
  const [unread, setUnread] = useState(0)
  const profileMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!session) return
    const refresh = () => { void api.alerts().then(result => setUnread(result.unread_count)).catch(() => setUnread(0)) }
    refresh()
    const timer = window.setInterval(refresh, 60000)
    return () => window.clearInterval(timer)
  }, [session, location.pathname])

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
  if (!allowedPaths[session.user.role]) return <div className="auth-loading" role="alert">Your session does not include a valid role. Apply the database migration and restart the API, then sign in again. <button onClick={() => void onSignOut()}>Sign out</button></div>

  return <div className={`app-shell${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
    <aside className="sidebar" id="workspace-sidebar">
      <Link className="brand" to="/" aria-label="Flevio home"><span className="brand-mark">F</span><div><strong>Flevio</strong><small>FUEL OPERATIONS</small></div></Link>
      <nav aria-label="Main navigation">{session.user.role === 'Driver' ? <div className="nav-group"><span className="nav-group-title">DRIVER</span>{driverNavigation.map(([path, label, icon]) => <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><NavIcon name={icon} /><span className="nav-label">{label}</span></NavLink>)}</div> : navigationGroups.map(group => {
        const paths = group.paths.filter(path => allowedPaths[session.user.role].includes(path))
        return paths.length ? <div className="nav-group" key={group.title}>
        <span className="nav-group-title">{group.title}</span>
        {paths.map(path => { const item = navigation.find(([url]) => url === path); if (!item) return null; const [, label, icon] = item; return <NavLink key={path} to={path} end={path === '/'} aria-label={label} title={sidebarOpen ? undefined : label} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}><NavIcon name={icon} /><span className="nav-label">{label}</span></NavLink> })}
      </div> : null })}</nav>
    </aside>
    <div className="main-area"><header className="topbar">
      <div className="topbar-leading"><button className="topbar-menu" aria-label={sidebarOpen ? 'Collapse navigation' : 'Expand navigation'} aria-controls="workspace-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(!sidebarOpen)}><MenuIcon /></button><span className="topbar-welcome">Welcome <strong>Flevio</strong>!</span></div>
      <div className="topbar-actions">
        <div className="topbar-popover-anchor"><button className="topbar-language" aria-label="Language: English (UK)" aria-expanded={showLanguage} aria-haspopup="menu" onClick={() => { setShowLanguage(!showLanguage); setShowAlerts(false); setShowProfile(false) }}><GlobeIcon /><span>en</span></button>{showLanguage && <div className="topbar-popover language-popover" role="menu" aria-label="Language"><button className="language-option" role="menuitem" onClick={() => setShowLanguage(false)}>English (UK)</button></div>}</div>
        <div className="topbar-popover-anchor"><button className="topbar-alert-button" aria-label={`Alerts, ${unread} unread`} aria-expanded={showAlerts} onClick={() => { setShowAlerts(!showAlerts); setShowProfile(false); setShowLanguage(false) }}><BellIcon />{unread > 0 && <span className="alert-badge" />}</button>{showAlerts && <div className="topbar-popover"><strong>{unread} unread alerts</strong><p>{plan?.safety_failure?.message || 'Review your fleet notifications.'}</p><Link to="/alerts" onClick={() => setShowAlerts(false)}>Open alerts</Link></div>}</div>
        <div className="topbar-popover-anchor" ref={profileMenuRef}>
          <button className="topbar-profile" aria-label="Account menu" aria-expanded={showProfile} aria-haspopup="menu" onClick={() => { setShowProfile(!showProfile); setShowAlerts(false); setShowLanguage(false) }}>
            <span className="profile-avatar">{session.user.name.trim().charAt(0).toUpperCase()}</span>
          </button>
          {showProfile && <div className="topbar-popover profile-popover" role="menu" aria-label="Account">
            <div className="profile-menu-welcome">Welcome {session.user.name.trim().split(/\s+/)[0]}!</div>
            <Link className="profile-menu-item" role="menuitem" to="/profile" onClick={() => setShowProfile(false)}><ProfileMenuIcon name="profile" />Profile</Link>
            {allowedPaths[session.user.role].includes('/alerts') && <Link className="profile-menu-item" role="menuitem" to="/alerts" onClick={() => setShowProfile(false)}><ProfileMenuIcon name="notifications" />Notifications</Link>}
            {allowedPaths[session.user.role].includes('/fuel-prices') && <Link className="profile-menu-item" role="menuitem" to="/fuel-prices" onClick={() => setShowProfile(false)}><ProfileMenuIcon name="pricing" />Pricing</Link>}
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
        <Route path="/" element={session?.user.role === 'Driver' ? <DriverHome section="dashboard" /> : session?.user.role === 'Fuel Coordinator' ? <FuelPrices /> : <Dashboard plan={latestPlan} name={session?.user.name || 'there'} />} />
        <Route path="/my-profile" element={<Protected user={session?.user} path="/my-profile"><DriverHome section="profile" /></Protected>} />
        <Route path="/my-vehicle" element={<Protected user={session?.user} path="/my-vehicle"><DriverHome section="vehicle" /></Protected>} />
        <Route path="/my-trips" element={<Protected user={session?.user} path="/my-trips"><DriverHome section="trips" /></Protected>} />
        <Route path="/fuel-instructions" element={<Protected user={session?.user} path="/fuel-instructions"><DriverHome section="instructions" /></Protected>} />
        <Route path="/profile" element={session ? <ProfilePage user={session.user} /> : null} />
        <Route path="/help" element={<div className="account-page"><h1>Help</h1><div className="account-card"><p>Use your sidebar to access the modules available to your role.</p></div></div>} />
        <Route path="/fuel-prices" element={<Protected user={session?.user} path="/fuel-prices"><FuelPrices /></Protected>} />
        <Route path="/trucks" element={<Protected user={session?.user} path="/trucks"><TruckRegistry readOnly={session?.user.role === 'Dispatcher'} /></Protected>} />
        <Route path="/trip-planner" element={<Protected user={session?.user} path="/trip-planner"><TripPlanner onPlan={setLatestPlan} /></Protected>} />
        <Route path="/fuel-stops" element={<Protected user={session?.user} path="/fuel-stops"><FuelStopsPage manage={session?.user.role === 'Admin' || session?.user.role === 'Fleet Manager'} /></Protected>} />
        <Route path="/trip-history" element={session?.user.role === 'Driver' ? <DriverHome section="history" /> : <Protected user={session?.user} path="/trip-history"><TripHistory /></Protected>} />
        <Route path="/settings" element={<Protected user={session?.user} path="/settings"><Settings /></Protected>} />
        <Route path="/drivers" element={<Protected user={session?.user} path="/drivers"><DriversPage readOnly={session?.user.role === 'Dispatcher'} /></Protected>} />
        <Route path="/ai-assistant" element={<Protected user={session?.user} path="/ai-assistant"><AssistantPage /></Protected>} />
        <Route path="/alerts" element={<Protected user={session?.user} path="/alerts"><AlertsPage /></Protected>} />
        <Route path="/reports" element={<Protected user={session?.user} path="/reports"><ReportsPage /></Protected>} />
        <Route path="/users-roles" element={<Protected user={session?.user} path="/users-roles">{session ? <UsersRolesPage user={session.user} /> : null}</Protected>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>}</BrowserRouter>
}

export default App
