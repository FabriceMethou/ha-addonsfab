import React, { useState, useEffect } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'

const EVENT_TYPES = [
  { key: 'geofenceEnter', label: 'Geofence arrival', icon: '📍' },
  { key: 'geofenceExit', label: 'Geofence departure', icon: '🚪' },
  { key: 'deviceOverspeed', label: 'Overspeed', icon: '⚡' },
  { key: 'lowBattery', label: 'Low battery', icon: '🔋' },
  { key: 'alarm', label: 'Alarm', icon: '🚨' },
  { key: 'sos', label: 'SOS emergency', icon: '🆘' },
  { key: 'noShow', label: 'No-show alerts', icon: '⏰' },
]

const STORAGE_KEY = 'notificationPrefs'

function loadPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore corrupt data */ }
  return null
}

function savePrefs(prefs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
}

function getDefaultPrefs(devices) {
  return {
    eventTypes: Object.fromEntries(EVENT_TYPES.map((e) => [e.key, true])),
    devices: Object.fromEntries(devices.map((d) => [d.id, true])),
  }
}

/** Read-only access for use by the alert filtering logic in the store. */
export function getNotificationPrefs() {
  return loadPrefs()
}

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

export default function NotificationSettings() {
  const devices = useTraccarStore((s) => s.devices)
  const [prefs, setPrefs] = useState(() => loadPrefs() ?? getDefaultPrefs(devices))

  // Sync new devices into prefs (default: enabled)
  useEffect(() => {
    setPrefs((prev) => {
      const updated = { ...prev, devices: { ...prev.devices } }
      let changed = false
      for (const d of devices) {
        if (updated.devices[d.id] === undefined) {
          updated.devices[d.id] = true
          changed = true
        }
      }
      if (changed) savePrefs(updated)
      return changed ? updated : prev
    })
  }, [devices])

  function toggleEventType(key) {
    setPrefs((prev) => {
      const next = {
        ...prev,
        eventTypes: { ...prev.eventTypes, [key]: !prev.eventTypes[key] },
      }
      savePrefs(next)
      return next
    })
  }

  function toggleDevice(deviceId) {
    setPrefs((prev) => {
      const next = {
        ...prev,
        devices: { ...prev.devices, [deviceId]: !prev.devices[deviceId] },
      }
      savePrefs(next)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Event type toggles */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 mb-2">
          Notification Types
        </h3>
        <div className="space-y-1">
          {EVENT_TYPES.map((et) => (
            <div
              key={et.key}
              className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{et.icon}</span>
                <span className="text-sm dark:text-white">{et.label}</span>
              </div>
              <Toggle
                checked={prefs.eventTypes?.[et.key] !== false}
                onChange={() => toggleEventType(et.key)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Per-device toggles */}
      {devices.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-1 mb-2">
            Devices
          </h3>
          <div className="space-y-1">
            {devices.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <span className="text-sm dark:text-white truncate">{d.name}</span>
                <Toggle
                  checked={prefs.devices?.[d.id] !== false}
                  onChange={() => toggleDevice(d.id)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
