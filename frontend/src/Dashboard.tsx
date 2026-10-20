import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Price, type TripPlan, type TripRecord } from './api'

type Summary = Awaited<ReturnType<typeof api.dashboard>>
type Period = 'year' | 'rolling'

const compactNumber = new Intl.NumberFormat('en-PK', { maximumFractionDigits: 1 })
const dateLabel = new Intl.DateTimeFormat('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })
const monthLabel = new Intl.DateTimeFormat('en-PK', { month: 'short' })

function validDate(value: string): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value: string) {
  const date = validDate(value)
  return date ? dateLabel.format(date) : 'Date unavailable'
}

function monthsFor(period: Period) {
  const today = new Date()
  const first = period === 'year' ? new Date(today.getFullYear(), 0, 1) : new Date(today.getFullYear(), today.getMonth() - 11, 1)
  return Array.from({ length: 12 }, (_, index) => new Date(first.getFullYear(), first.getMonth() + index, 1))
}

function seriesFor(rows: TripRecord[], months: Date[], value: (row: TripRecord) => number) {
  const totals = months.map(() => 0)
  const first = months[0]
  for (const row of rows) {
    const date = validDate(row.date)
    if (!date) continue
    const index = (date.getFullYear() - first.getFullYear()) * 12 + date.getMonth() - first.getMonth()
    if (index >= 0 && index < totals.length) totals[index] += value(row)
  }
  return totals
}

function TrendChart({ values, months, color, id, unit }: { values: number[]; months: Date[]; color: string; id: string; unit: string }) {
  const width = 590
  const height = 210
  const left = 37
  const right = 12
  const top = 14
  const bottom = 35
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const max = Math.max(...values, 1)
  const ceiling = Math.ceil(max / 4) * 4 || 4
  const points = values.map((value, index) => ({
    x: left + (index * plotWidth) / (values.length - 1),
    y: top + plotHeight - (value / ceiling) * plotHeight,
  }))
  const line = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const area = `${line} L ${points.at(-1)?.x} ${top + plotHeight} L ${points[0].x} ${top + plotHeight} Z`
  return <svg className="dash-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${unit} over the selected 12 months`}>
    <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".23" /><stop offset="100%" stopColor={color} stopOpacity=".01" /></linearGradient></defs>
    {[0, 1, 2, 3, 4].map(step => {
      const y = top + (step * plotHeight) / 4
      const label = compactNumber.format((ceiling * (4 - step)) / 4)
      return <g key={step}><line x1={left} x2={width - right} y1={y} y2={y} stroke="#e8edf5" strokeDasharray={step === 4 ? undefined : '3 5'} /><text x={left - 9} y={y + 4} textAnchor="end" className="dash-chart-axis">{label}</text></g>
    })}
    <path d={area} fill={`url(#${id})`} />
    <path d={line} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    {points.map((point, index) => <g key={index}><circle cx={point.x} cy={point.y} r="3.8" fill="#fff" stroke={color} strokeWidth="2.5" /><text x={point.x} y={height - 8} textAnchor="middle" className="dash-chart-axis">{monthLabel.format(months[index])}</text></g>)}
  </svg>
}

function PanelTitle({ title, detail, to }: { title: string; detail?: string; to?: string }) {
  return <div className="dash-panel-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{to && <Link to={to}>View all</Link>}</div>
}

function DataEmpty({ children }: { children: string }) { return <p className="dash-empty">{children}</p> }

function MetricIcon({ name, tone }: { name: string; tone: 'mint' | 'blue' | 'amber' | 'violet' }) {
  const image = `url("${import.meta.env.BASE_URL}icons/sidebar/${name}.svg")`
  return <span className={`dash-metric-accent ${tone}`} aria-hidden="true"><span className="dash-metric-glyph" style={{ maskImage: image, WebkitMaskImage: image }} /></span>
}

export default function Dashboard({ plan, name }: { plan: TripPlan | null; name: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [records, setRecords] = useState<TripRecord[]>([])
  const [recordCount, setRecordCount] = useState(0)
  const [prices, setPrices] = useState<Price[]>([])
  const [period, setPeriod] = useState<Period>('year')
  const [loading, setLoading] = useState(true)
  const [errors, setErrors] = useState<string[]>([])

  useEffect(() => {
    let active = true
    void Promise.allSettled([api.dashboard(), api.trips(), api.prices()]).then(([dashboardResult, tripsResult, pricesResult]) => {
      if (!active) return
      const failures: string[] = []
      if (dashboardResult.status === 'fulfilled') setSummary(dashboardResult.value)
      else failures.push('summary')
      if (tripsResult.status === 'fulfilled') {
        setRecords(tripsResult.value.rows)
        setRecordCount(tripsResult.value.count)
      } else failures.push('trip history')
      if (pricesResult.status === 'fulfilled') setPrices(pricesResult.value.rows)
      else failures.push('fuel prices')
      setErrors(failures)
      setLoading(false)
    })
    return () => { active = false }
  }, [])

  const months = useMemo(() => monthsFor(period), [period])
  const fuelSeries = useMemo(() => seriesFor(records, months, row => Number(row.fuel_required_l) || 0), [records, months])
  const tripSeries = useMemo(() => seriesFor(records, months, () => 1), [records, months])
  const visibleTrips = records.length ? records.slice(0, 4) : summary?.recent_trips.slice(0, 4) || []
  const topVehicles = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of records) totals.set(row.truck_name, (totals.get(row.truck_name) || 0) + (Number(row.fuel_required_l) || 0))
    return [...totals].sort((a, b) => b[1] - a[1]).slice(0, 3)
  }, [records])
  const largestVehicle = Math.max(...topVehicles.map(([, value]) => value), 1)
  const hasChartData = tripSeries.some(value => value > 0)

  return <div className="dashboard-page">
    <div className="dash-intro"><div><h1>Dashboard</h1><p>Welcome back, <strong>{name}</strong></p></div><label className="dash-period">View activity <select value={period} onChange={event => setPeriod(event.target.value as Period)}><option value="year">This year</option><option value="rolling">Last 12 months</option></select></label></div>
    {errors.length > 0 && <div className="dash-warning" role="alert">Unable to load {errors.join(', ')}. Some dashboard sections may be incomplete.</div>}
    <div className="dash-metrics">
      <Link className="dash-metric" to="/trucks"><span>Total Vehicles</span><strong>{summary ? compactNumber.format(summary.truck_count) : '—'}</strong><small>Registered fleet</small><MetricIcon name="truck" tone="mint" /></Link>
      <Link className="dash-metric" to="/trip-history"><span>Total Trips</span><strong>{summary ? compactNumber.format(summary.planned_trip_count) : '—'}</strong><small>Saved trip plans</small><MetricIcon name="route" tone="blue" /></Link>
      <Link className="dash-metric" to="/trip-history"><span>Estimated Fuel Demand (L)</span><strong>{summary ? compactNumber.format(summary.estimated_fuel_demand_l) : '—'}</strong><small>From saved trips</small><MetricIcon name="droplet" tone="amber" /></Link>
      <div className="dash-metric"><span>Fuel Costs (PKR)</span><strong>—</strong><small>Cost tracking unavailable</small><MetricIcon name="currency-rupee" tone="violet" /></div>
    </div>
    <div className="dash-main-grid">
      <section className="dash-panel dash-chart-panel"><PanelTitle title="Monthly Fuel Demand (L)" detail="Estimated from saved trips" />{hasChartData ? <TrendChart values={fuelSeries} months={months} color="#14a58a" id="fuel-area" unit="Estimated fuel demand in liters" /> : <DataEmpty>No trips in this period yet.</DataEmpty>}</section>
      <section className="dash-panel dash-chart-panel"><PanelTitle title="Trip Activity" detail="Saved trips by month" />{hasChartData ? <TrendChart values={tripSeries} months={months} color="#7c6bd6" id="trip-area" unit="Saved trips" /> : <DataEmpty>No trips in this period yet.</DataEmpty>}</section>
      <section className="dash-panel dash-recent"><PanelTitle title="Recent Trips" to="/trip-history" />{visibleTrips.length ? <div className="dash-recent-list">{visibleTrips.map((row, index) => <div className="dash-recent-row" key={`${row.date}-${row.truck_name}-${index}`}><span className="dash-row-dot" /><div><strong>{row.origin} → {row.destination}</strong><small>{row.truck_name}</small></div><time>{formatDate(row.date)}</time><span className="dash-status">Saved</span></div>)}</div> : <DataEmpty>No saved trips yet.</DataEmpty>}</section>
    </div>
    <div className="dash-bottom-grid">
      <section className="dash-panel"><PanelTitle title="Top Vehicles by Fuel" detail="Based on saved trip estimates" to="/trucks" />{topVehicles.length ? <div className="dash-vehicle-list">{topVehicles.map(([name, amount]) => <div className="dash-vehicle" key={name}><div><strong>{name}</strong><span>{compactNumber.format(amount)} L</span></div><div className="dash-bar"><span style={{ width: `${(amount / largestVehicle) * 100}%` }} /></div></div>)}</div> : <DataEmpty>Vehicle fuel data appears after trips are saved.</DataEmpty>}</section>
      <section className="dash-panel"><PanelTitle title="Fuel Alerts" /><div className={`dash-alert ${plan?.safety_failure ? 'has-alert' : ''}`}><span className="dash-alert-symbol">{plan?.safety_failure ? '!' : '✓'}</span><div><strong>{plan?.safety_failure ? 'Route needs attention' : 'No active route alerts'}</strong><p>{plan?.safety_failure?.message || 'Plan a trip to check fuel and route safety.'}</p></div></div></section>
      <section className="dash-panel"><PanelTitle title="Fuel Price Updates" to="/fuel-prices" />{prices.length ? <div className="dash-price-list">{prices.slice(0, 3).map((price, index) => <div className="dash-price-row" key={`${price.name}-${index}`}><span className="dash-price-symbol">₨</span><div><strong>{price.name}</strong><small>Freshness unverified</small></div><span>{price.your_price ?? '—'}</span></div>)}</div> : <DataEmpty>No recorded fuel prices yet.</DataEmpty>}</section>
      <section className="dash-panel"><PanelTitle title="Quick Actions" /><div className="dash-actions"><Link to="/trucks">Add Vehicle</Link><Link to="/trip-planner">Plan Trip</Link><Link to="/fuel-prices">Import Fuel Prices</Link><Link to="/trip-history">View Fuel Records</Link></div></section>
    </div>
    {recordCount > records.length && <p className="dash-footnote">Charts and vehicle rankings use the {records.length} most recent saved trips.</p>}
    {loading && <span className="sr-only" role="status">Loading dashboard data</span>}
  </div>
}
