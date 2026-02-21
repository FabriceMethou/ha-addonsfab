import React, { useState, useEffect } from 'react'
import { format } from 'date-fns'

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
 * Life360-style day timeline: trips and stops for a single day merged
 * into one chronological vertical list.
 * Trips are clickable and load into the replay engine.
 */
export default function DayTimeline({ deviceId, onSelectTrip, selectedStartTime }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const [date, setDate] = useState(todayStr)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!deviceId || !date) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        // Append T00:00:00 (no Z) so Date is interpreted in local time, not UTC
        const from = new Date(date + 'T00:00:00').toISOString()
        const to   = new Date(date + 'T23:59:59.999').toISOString()
        const qs = `deviceId=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`

        const [tripsRes, stopsRes] = await Promise.all([
          fetch(`./api/reports/trips?${qs}`),
          fetch(`./api/reports/stops?${qs}`),
        ])

        const [trips, stops] = await Promise.all([
          tripsRes.ok ? tripsRes.json() : Promise.resolve([]),
          stopsRes.ok ? stopsRes.json() : Promise.resolve([]),
        ])

        if (!cancelled) {
          const tripsArr = Array.isArray(trips) ? trips.map((t) => ({ ...t, _type: 'trip' })) : []
          const stopsArr = Array.isArray(stops) ? stops.map((s) => ({ ...s, _type: 'stop' })) : []
          const merged = [...tripsArr, ...stopsArr].sort(
            (a, b) => new Date(a.startTime) - new Date(b.startTime)
          )
          setItems(merged)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [deviceId, date])

  return (
    <div className="flex flex-col">
      {/* Date picker */}
      <div className="flex items-center gap-2 px-3 pb-2">
        <label className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">Day:</label>
        <input
          type="date"
          max={todayStr}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="flex-1 text-xs rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-1.5 py-0.5"
        />
        {date !== todayStr && (
          <button
            onClick={() => setDate(todayStr)}
            className="text-xs text-blue-500 hover:text-blue-700 flex-shrink-0"
          >
            Today
          </button>
        )}
      </div>

      {loading && <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">Loading timeline...</p>}
      {error && <p className="text-xs text-red-500 px-3 py-2">{error}</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">No activity on {date}.</p>
      )}

      <div className="overflow-y-auto max-h-80 px-3 pb-2">
        {items.map((item, i) => {
          const isLast = i === items.length - 1

          if (item._type === 'trip') {
            const isSelected = selectedStartTime === item.startTime
            const distM = item.distance ?? 0
            const durMs = item.duration ?? 0
            const maxKmh = Math.round((item.maxSpeed ?? 0) * 1.852)

            return (
              <div key={i} className="flex gap-2">
                {/* Vertical timeline rail */}
                <div className="flex flex-col items-center w-4 flex-shrink-0">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-400 mt-2 flex-shrink-0 ring-2 ring-white dark:ring-gray-800" />
                  {!isLast && <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700 min-h-[8px]" />}
                </div>

                <button
                  onClick={() => onSelectTrip(item)}
                  className={`flex-1 text-left px-2 py-1.5 mb-1 rounded-lg transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/40 ring-1 ring-blue-400'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                      🚗 {format(new Date(item.startTime), 'HH:mm')}
                    </span>
                    <span className="text-xs text-blue-500 dark:text-blue-400 font-medium">
                      {formatDist(distM)} · {formatDuration(durMs)}
                    </span>
                  </div>
                  {maxKmh > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500">Max {maxKmh} km/h</p>
                  )}
                  {(item.startAddress || item.endAddress) && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">
                      {item.startAddress ?? '?'} → {item.endAddress ?? '?'}
                    </p>
                  )}
                </button>
              </div>
            )
          }

          // Stop entry
          const durMs = item.duration ?? 0
          return (
            <div key={i} className="flex gap-2">
              <div className="flex flex-col items-center w-4 flex-shrink-0">
                <div className="w-2.5 h-2.5 rounded-full bg-gray-300 dark:bg-gray-600 mt-2 flex-shrink-0 ring-2 ring-white dark:ring-gray-800" />
                {!isLast && <div className="w-0.5 flex-1 bg-gray-200 dark:bg-gray-700 min-h-[8px]" />}
              </div>
              <div className="flex-1 px-2 py-1.5 mb-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                    💤 {format(new Date(item.startTime), 'HH:mm')}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{formatDuration(durMs)}</span>
                </div>
                {item.address && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.address}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
