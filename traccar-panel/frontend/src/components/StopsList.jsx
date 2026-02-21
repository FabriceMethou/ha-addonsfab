import React, { useState, useEffect } from 'react'
import { format, subDays } from 'date-fns'

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

/**
 * Shows auto-detected stops from Traccar's /api/reports/stops.
 */
export default function StopsList({ deviceId }) {
  const [stops, setStops] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(7)

  useEffect(() => {
    if (!deviceId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const from = subDays(new Date(), days).toISOString()
        const to = new Date().toISOString()
        const res = await fetch(
          `./api/reports/stops?deviceId=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setStops(Array.isArray(data) ? data : [])
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [deviceId, days])

  if (!deviceId) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">Select a device above.</p>
  }

  return (
    <div className="flex flex-col">
      {/* Range selector */}
      <div className="flex gap-1 px-3 pb-2">
        {[1, 7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`flex-1 py-0.5 text-xs rounded ${
              days === d
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            {d === 1 ? 'Today' : `${d}d`}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">Loading stops...</p>
      )}
      {error && (
        <p className="text-xs text-red-500 px-3 py-2">{error}</p>
      )}
      {!loading && !error && stops.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
          No stops in the last {days} day{days > 1 ? 's' : ''}.
        </p>
      )}

      <div className="overflow-y-auto max-h-72">
        {stops.map((stop, i) => {
          const start = new Date(stop.startTime)
          const durMs = stop.duration ?? 0
          return (
            <div
              key={i}
              className="px-3 py-2 border-b border-gray-100 dark:border-gray-700"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium dark:text-white">
                  {format(start, 'EEE d MMM, HH:mm')}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{formatDuration(durMs)}</span>
              </div>
              {(stop.address) && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{stop.address}</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
