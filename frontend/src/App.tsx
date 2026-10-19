import { useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import type { TripPlan } from './api'
import { Dashboard, FuelPrices, FuelStops, Settings, TripHistory, TripPlanner, TruckRegistry } from './Pages'

const navigation = [
  ['/', 'Dashboard'], ['/fuel-prices', 'Fuel Prices'], ['/trucks', 'Truck Registry'],
  ['/trip-planner', 'Trip Planner'], ['/fuel-stops', 'Fuel Stops'],
  ['/trip-history', 'Trip History'], ['/settings', 'Settings'],
] as const

function App() {
  const [latestPlan, setLatestPlan] = useState<TripPlan | null>(null)
  return <BrowserRouter><div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">F</span><div><strong>Fuel Management</strong><small>OPERATIONS SYSTEM</small></div></div>
      <nav aria-label="Main navigation">{navigation.map(([path, label], index) =>
        <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
          <span>{String(index + 1).padStart(2, '0')}</span>{label}
        </NavLink>)}</nav>
      <div className="sidebar-footer"><span className="status-dot" /> Development workspace</div>
    </aside>
    <div className="main-area"><header className="topbar"><span>OCR Based Fuel Management System</span><span className="topbar-tag">FYP PROJECT</span></header>
      <main className="content"><Routes>
        <Route path="/" element={<Dashboard plan={latestPlan} />} />
        <Route path="/fuel-prices" element={<FuelPrices />} />
        <Route path="/trucks" element={<TruckRegistry />} />
        <Route path="/trip-planner" element={<TripPlanner onPlan={setLatestPlan} />} />
        <Route path="/fuel-stops" element={<FuelStops plan={latestPlan} />} />
        <Route path="/trip-history" element={<TripHistory />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes></main>
    </div>
  </div></BrowserRouter>
}

export default App
