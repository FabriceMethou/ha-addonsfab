import React, { useState } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'
import { loadRules, addRule, removeRule, toggleRule } from '../utils/arrivalRules.js'

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
          checked ? 'translate-x-4 ml-0.5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function ArrivalRules() {
  const devices = useTraccarStore((s) => s.devices)
  const geofences = useTraccarStore((s) => s.geofences)

  const [rules, setRules] = useState(() => loadRules())
  const [adding, setAdding] = useState(false)

  // Form state
  const [formDeviceId, setFormDeviceId] = useState('')
  const [formGeofenceId, setFormGeofenceId] = useState('')
  const [formTime, setFormTime] = useState('08:00')
  const [formDays, setFormDays] = useState([1, 2, 3, 4, 5]) // Mon-Fri default

  function handleToggleDay(day) {
    setFormDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  function handleAdd() {
    if (!formDeviceId || !formGeofenceId || formDays.length === 0) return
    const updated = addRule({
      deviceId: Number(formDeviceId),
      geofenceId: Number(formGeofenceId),
      time: formTime,
      days: formDays,
      enabled: true,
    })
    setRules(updated)
    setAdding(false)
  }

  function handleRemove(id) {
    setRules(removeRule(id))
  }

  function handleToggle(id) {
    setRules(toggleRule(id))
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Arrival Alerts
        </h3>
        <button
          onClick={() => setAdding(!adding)}
          className="text-xs font-medium text-blue-500 hover:text-blue-700 dark:text-blue-400"
        >
          {adding ? 'Cancel' : '+ Add rule'}
        </button>
      </div>

      {/* Add rule form */}
      {adding && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 space-y-2">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Device</label>
            <select
              value={formDeviceId}
              onChange={(e) => setFormDeviceId(e.target.value)}
              className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1 mt-0.5"
            >
              <option value="">Select device...</option>
              {devices.map((d) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Place</label>
            <select
              value={formGeofenceId}
              onChange={(e) => setFormGeofenceId(e.target.value)}
              className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1 mt-0.5"
            >
              <option value="">Select place...</option>
              {geofences.map((g) => (
                <option key={g.id} value={String(g.id)}>{g.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Arrive by</label>
            <input
              type="time"
              value={formTime}
              onChange={(e) => setFormTime(e.target.value)}
              className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1 mt-0.5"
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Days</label>
            <div className="flex gap-1">
              {DAY_LABELS.map((label, idx) => (
                <button
                  key={idx}
                  onClick={() => handleToggleDay(idx)}
                  className={`flex-1 py-1 text-xs rounded ${
                    formDays.includes(idx)
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleAdd}
            disabled={!formDeviceId || !formGeofenceId || formDays.length === 0}
            className="w-full py-1.5 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Add Alert Rule
          </button>
        </div>
      )}

      {/* Rule list */}
      {rules.length === 0 && !adding && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
          No arrival rules. Add one to get alerted when someone doesn't arrive on time.
        </p>
      )}
      {rules.map((rule) => {
        const device = devices.find((d) => d.id === rule.deviceId)
        const geofence = geofences.find((g) => g.id === rule.geofenceId)
        const dayText = rule.days
          .sort((a, b) => a - b)
          .map((d) => DAY_LABELS[d])
          .join(', ')

        return (
          <div
            key={rule.id}
            className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium dark:text-white truncate">
                {device?.name ?? 'Unknown'} at {geofence?.name ?? 'Unknown'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                By {rule.time} · {dayText}
              </p>
            </div>
            <Toggle
              checked={rule.enabled}
              onChange={() => handleToggle(rule.id)}
            />
            <button
              onClick={() => handleRemove(rule.id)}
              className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0"
              title="Delete rule"
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
