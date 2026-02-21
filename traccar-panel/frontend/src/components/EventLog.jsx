import React, { useState, useEffect } from 'react'
import { format, subDays } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'

const EVENT_LABELS = {
  geofenceEnter: 'Arrived at',
  geofenceExit: 'Left',
  deviceOnline: 'Online',
  deviceOffline: 'Offline',
  deviceMoving: 'Moving',
  deviceStopped: 'Stopped',
  deviceOverspeed: 'Overspeed',
  alarm: 'Alarm',
  ignitionOn: 'Ignition on',
  ignitionOff: 'Ignition off',
  powerOn: 'Power on',
  powerOff: 'Power off',
  maintenance: 'Maintenance',
  commandResult: 'Command result',
}

const EVENT_COLORS = {
  geofenceEnter: 'text-green-600 dark:text-green-400',
  geofenceExit: 'text-orange-500 dark:text-orange-400',
  deviceOnline: 'text-blue-500 dark:text-blue-400',
  deviceOffline: 'text-gray-400',
  deviceOverspeed: 'text-red-500 dark:text-red-400',
  alarm: 'text-red-600 dark:text-red-400',
  ignitionOn: 'text-emerald-600 dark:text-emerald-400',
  ignitionOff: 'text-gray-500 dark:text-gray-400',
  powerOff: 'text-red-500 dark:text-red-400',
  maintenance: 'text-purple-600 dark:text-purple-400',
}

export default function EventLog() {
  const devices = useTraccarStore((s) => s.devices)
  const geofences = useTraccarStore((s) => s.geofences)

  const [deviceId, setDeviceId] = useState('')
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [days, setDays] = useState(7)

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
      try {
        const from = subDays(new Date(), days).toISOString()
        const to = new Date().toISOString()
        const res = await fetch(
          `./api/reports/events?deviceId=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
        )
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!cancelled) {
          // Sort newest first
          const sorted = Array.isArray(data)
            ? [...data].sort((a, b) => new Date(b.eventTime) - new Date(a.eventTime))
            : []
          setEvents(sorted)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [deviceId, days])

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

      {/* Day range */}
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
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">Loading events...</p>
      )}
      {error && (
        <p className="text-xs text-red-500 px-3 py-2">{error}</p>
      )}
      {!loading && !error && events.length === 0 && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-2">
          No events in the last {days} day{days > 1 ? 's' : ''}.
        </p>
      )}

      <div className="overflow-y-auto flex-1">
        {events.map((ev, i) => {
          const gf = ev.geofenceId ? geofences.find((g) => g.id === ev.geofenceId) : null
          const label = EVENT_LABELS[ev.type] ?? ev.type
          const colorClass = EVENT_COLORS[ev.type] ?? 'text-gray-500 dark:text-gray-400'
          return (
            <div
              key={i}
              className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex items-start gap-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-xs font-medium ${colorClass}`}>{label}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {format(new Date(ev.eventTime), 'EEE d MMM, HH:mm')}
                  </span>
                </div>
                {gf && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{gf.name}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
