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

// Format a local date string (YYYY-MM-DD) into ISO range for that full day.
// Appending T00:00:00 (no Z) makes the Date constructor interpret in local time,
// avoiding the UTC-midnight pitfall that causes wrong-day queries for non-UTC users.
function dayToRange(dateStr) {
  const from = new Date(dateStr + 'T00:00:00').toISOString()
  const to   = new Date(dateStr + 'T23:59:59.999').toISOString()
  return { from, to }
}

/**
 * Shows auto-detected trips from Traccar's /api/reports/trips.
 * Calling onSelectTrip({startTime, endTime}) loads that trip in the replay player.
 */
export default function TripsList({ deviceId, onSelectTrip, selectedStartTime }) {
  const [trips, setTrips] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(7)
  // pickedDate: 'YYYY-MM-DD' string or '' ('' = use days-based range)
  const [pickedDate, setPickedDate] = useState('')

  useEffect(() => {
    if (!deviceId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        let from, to
        if (pickedDate) {
          ;({ from, to } = dayToRange(pickedDate))
        } else {
          from = subDays(new Date(), days).toISOString()
          to = new Date().toISOString()
        }
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
  }, [deviceId, days, pickedDate])

  if (!deviceId) {
    return <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">Select a device above.</p>
  }

  const todayStr = format(new Date(), 'yyyy-MM-dd')

  return (
    <div className="flex flex-col">
      {/* Range selector */}
      <div className="flex gap-1 px-3 pb-1">
        {[1, 7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => { setDays(d); setPickedDate('') }}
            className={`flex-1 py-0.5 text-xs rounded ${
              !pickedDate && days === d
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}
          >
            {d === 1 ? 'Today' : `${d}d`}
          </button>
        ))}
      </div>

      {/* Date picker */}
      <div className="flex items-center gap-1 px-3 pb-2">
        <label className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Day:</label>
        <input
          type="date"
          max={todayStr}
          value={pickedDate}
          onChange={(e) => setPickedDate(e.target.value)}
          className={`flex-1 text-xs rounded border px-1.5 py-0.5 dark:bg-gray-800 dark:text-white ${
            pickedDate
              ? 'border-blue-400 dark:border-blue-500'
              : 'border-gray-300 dark:border-gray-600'
          }`}
        />
        {pickedDate && (
          <button
            onClick={() => setPickedDate('')}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1"
            title="Clear date filter"
          >
            ×
          </button>
        )}
      </div>

      {loading && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">Loading trips...</p>
      )}
      {error && (
        <p className="text-xs text-red-500 px-3 py-2">{error}</p>
      )}
      {!loading && !error && trips.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
          {pickedDate ? `No trips on ${pickedDate}.` : `No trips in the last ${days} day${days > 1 ? 's' : ''}.`}
        </p>
      )}

      <div className="overflow-y-auto max-h-72">
        {trips.map((trip, i) => {
          const start = new Date(trip.startTime)
          const distM = trip.distance ?? 0
          const durMs = trip.duration ?? 0
          const maxKmh = Math.round((trip.maxSpeed ?? 0) * 1.852)
          const avgKmh = Math.round((trip.averageSpeed ?? 0) * 1.852)

          const isSelected = selectedStartTime === trip.startTime
          return (
            <button
              key={i}
              onClick={() => onSelectTrip(trip)}
              className={`w-full text-left px-3 py-2 border-b border-gray-100 dark:border-gray-700 transition-colors ${
                isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/40 border-l-2 border-l-blue-500'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
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
