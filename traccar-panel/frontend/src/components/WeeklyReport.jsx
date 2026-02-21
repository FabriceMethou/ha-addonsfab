import React, { useState, useEffect } from 'react'
import { subDays, format } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'

const KNOTS_TO_KMH = 1.852

function formatDuration(ms) {
  if (!ms) return '0m'
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-lg font-bold dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  )
}

const PERIOD_OPTIONS = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
]

export default function WeeklyReport() {
  const devices = useTraccarStore((s) => s.devices)
  const [deviceId, setDeviceId] = useState('')
  const [period, setPeriod] = useState(7)
  const [summary, setSummary] = useState(null)
  const [tripCount, setTripCount] = useState(null)
  const [idleMs, setIdleMs] = useState(null)
  const [safetyEvents, setSafetyEvents] = useState(null) // {hardBraking, hardAcceleration, overspeed}
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Default to first device
  useEffect(() => {
    if (devices.length > 0 && !deviceId) setDeviceId(String(devices[0].id))
  }, [devices]) // eslint-disable-line

  useEffect(() => {
    if (!deviceId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      setSummary(null)
      setTripCount(null)
      setIdleMs(null)
      setSafetyEvents(null)
      try {
        const from = subDays(new Date(), period).toISOString()
        const to = new Date().toISOString()
        const qs = `deviceId=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        const safetyTypes = 'type=hardBraking&type=hardAcceleration&type=deviceOverspeed'

        const [sumRes, tripsRes, stopsRes, eventsRes] = await Promise.all([
          fetch(`./api/reports/summary?${qs}`),
          fetch(`./api/reports/trips?${qs}`),
          fetch(`./api/reports/stops?${qs}`),
          fetch(`./api/reports/events?${qs}&${safetyTypes}`),
        ])

        if (!sumRes.ok) throw new Error(`Summary: HTTP ${sumRes.status}`)
        if (!tripsRes.ok) throw new Error(`Trips: HTTP ${tripsRes.status}`)

        const [sumData, tripsData, stopsData, eventsData] = await Promise.all([
          sumRes.json(),
          tripsRes.json(),
          stopsRes.ok ? stopsRes.json() : Promise.resolve([]),
          eventsRes.ok ? eventsRes.json() : Promise.resolve([]),
        ])

        if (!cancelled) {
          const s = Array.isArray(sumData) ? sumData[0] : sumData
          setSummary(s ?? null)
          setTripCount(Array.isArray(tripsData) ? tripsData.length : 0)
          const totalIdle = Array.isArray(stopsData)
            ? stopsData.reduce((acc, stop) => acc + (stop.duration ?? 0), 0)
            : 0
          setIdleMs(totalIdle)
          if (Array.isArray(eventsData)) {
            const counts = { hardBraking: 0, hardAcceleration: 0, overspeed: 0 }
            for (const ev of eventsData) {
              if (ev.type === 'hardBraking') counts.hardBraking++
              else if (ev.type === 'hardAcceleration') counts.hardAcceleration++
              else if (ev.type === 'deviceOverspeed') counts.overspeed++
            }
            setSafetyEvents(counts)
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [deviceId, period])

  const distKm = summary ? (summary.distance / 1000).toFixed(1) : '—'
  const maxKmh = summary ? Math.round((summary.maxSpeed ?? 0) * KNOTS_TO_KMH) : '—'
  const avgKmh = summary ? Math.round((summary.averageSpeed ?? 0) * KNOTS_TO_KMH) : '—'
  const driveTime = summary ? formatDuration(summary.engineHours ?? 0) : '—'

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Device selector */}
      <div className="px-3 pt-2 pb-1">
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1"
        >
          {devices.map((d) => (
            <option key={d.id} value={String(d.id)}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Period selector */}
      <div className="flex gap-1 px-3 pb-3">
        {PERIOD_OPTIONS.map((o) => (
          <button
            key={o.days}
            onClick={() => setPeriod(o.days)}
            className={`flex-1 py-0.5 text-xs rounded ${
              period === o.days
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">Loading report...</p>
      )}
      {error && (
        <p className="text-xs text-red-500 px-3 py-2">{error}</p>
      )}

      {!loading && !error && (
        <div className="px-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Distance" value={`${distKm} km`} />
            <StatCard label="Trips" value={tripCount ?? '—'} />
            <StatCard label="Drive time" value={driveTime} />
            <StatCard label="Max speed" value={maxKmh !== '—' ? `${maxKmh} km/h` : '—'} />
            {idleMs !== null && idleMs > 0 && (
              <StatCard label="Idle time" value={formatDuration(idleMs)} />
            )}
            {summary && avgKmh !== '—' && avgKmh > 0 && (
              <StatCard label="Avg speed" value={`${avgKmh} km/h`} />
            )}
          </div>

          {/* Driving safety events — only shown when device/tracker reports them */}
          {safetyEvents && (safetyEvents.hardBraking > 0 || safetyEvents.hardAcceleration > 0 || safetyEvents.overspeed > 0) && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Driving safety</p>
              <div className="grid grid-cols-2 gap-2">
                {safetyEvents.hardBraking > 0 && (
                  <StatCard label="Hard braking" value={String(safetyEvents.hardBraking)} sub="events" />
                )}
                {safetyEvents.hardAcceleration > 0 && (
                  <StatCard label="Rapid accel." value={String(safetyEvents.hardAcceleration)} sub="events" />
                )}
                {safetyEvents.overspeed > 0 && (
                  <StatCard label="Overspeed" value={String(safetyEvents.overspeed)} sub="events" />
                )}
              </div>
            </div>
          )}

          {!summary && !loading && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">No data for this period.</p>
          )}
        </div>
      )}
    </div>
  )
}
