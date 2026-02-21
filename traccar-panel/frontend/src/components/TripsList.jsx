import React, { useState, useEffect } from 'react'
import { format, subDays } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'

function formatDuration(ms) {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatDist(metres) {
  if (metres >= 1000) return `${(metres / 1000).toFixed(1)} km`
  return `${Math.round(metres)} m`
}

/**
 * Shows auto-detected trips from Traccar's /api/reports/trips.
 * Calling onSelectTrip({startTime, endTime}) loads that trip in the replay player.
 */
export default function TripsList({ deviceId, onSelectTrip }) {
  const [trips, setTrips] = useState([])
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
          `./api/reports/trips?deviceId=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) setTrips(Array.isArray(data) ? data : [])
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
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">Loading trips...</p>
      )}
      {error && (
        <p className="text-xs text-red-500 px-3 py-2">{error}</p>
      )}
      {!loading && !error && trips.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
          No trips in the last {days} day{days > 1 ? 's' : ''}.
        </p>
      )}

      <div className="overflow-y-auto max-h-72">
        {trips.map((trip, i) => {
          const start = new Date(trip.startTime)
          const distM = trip.distance ?? 0
          const durMs = trip.duration ?? 0
          const maxKmh = Math.round((trip.maxSpeed ?? 0) * 1.852)
          const avgKmh = Math.round((trip.averageSpeed ?? 0) * 1.852)

          return (
            <button
              key={i}
              onClick={() => onSelectTrip(trip)}
              className="w-full text-left px-3 py-2 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium dark:text-white">
                  {format(start, 'EEE d MMM, HH:mm')}
                </span>
                <span className="text-xs text-blue-500 font-medium">{formatDist(distM)}</span>
              </div>
              <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
                <span>{formatDuration(durMs)}</span>
                {maxKmh > 0 && <span>Max {maxKmh} km/h</span>}
                {avgKmh > 0 && <span>Avg {avgKmh} km/h</span>}
              </div>
              {(trip.startAddress || trip.endAddress) && (
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                  {trip.startAddress ?? ''} → {trip.endAddress ?? ''}
                </p>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
