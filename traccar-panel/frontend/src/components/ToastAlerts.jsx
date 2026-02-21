import React, { useEffect } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'

const ICONS = {
  geofenceEnter: '📍',
  geofenceExit: '🚪',
  lowBattery: '🔋',
  deviceOverspeed: '⚡',
}

const COLORS = {
  geofenceEnter: 'border-green-400 bg-green-50 dark:bg-green-900/40',
  geofenceExit: 'border-orange-400 bg-orange-50 dark:bg-orange-900/40',
  lowBattery: 'border-red-400 bg-red-50 dark:bg-red-900/40',
  deviceOverspeed: 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/40',
}

function Toast({ alert, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(alert.id), 6000)
    return () => clearTimeout(timer)
  }, [alert.id, onDismiss])

  let body
  if (alert.type === 'geofenceEnter') body = <>arrived at <strong>{alert.geofenceName}</strong></>
  else if (alert.type === 'geofenceExit') body = <>left <strong>{alert.geofenceName}</strong></>
  else if (alert.type === 'lowBattery') body = <>battery low ({alert.battery}%)</>
  else if (alert.type === 'deviceOverspeed') body = <>speeding{alert.speedKmh ? ` — ${alert.speedKmh} km/h` : ''}</>
  else body = alert.type

  return (
    <div
      className={`flex items-start gap-2 px-3 py-2 rounded-lg border shadow-md text-sm max-w-xs w-full ${COLORS[alert.type] ?? 'border-gray-300 bg-white dark:bg-gray-800'}`}
    >
      <span className="text-base flex-shrink-0">{ICONS[alert.type] ?? '●'}</span>
      <div className="flex-1 min-w-0">
        <p className="font-medium dark:text-white truncate">{alert.deviceName}</p>
        <p className="text-xs text-gray-600 dark:text-gray-300 truncate">{body}</p>
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 flex-shrink-0 leading-none"
      >
        ×
      </button>
    </div>
  )
}

export default function ToastAlerts() {
  const alerts = useTraccarStore((s) => s.alerts)
  const dismissAlert = useTraccarStore((s) => s.dismissAlert)

  if (alerts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[2000] flex flex-col gap-2 items-end pointer-events-none">
      {alerts.slice(0, 5).map((alert) => (
        <div key={alert.id} className="pointer-events-auto">
          <Toast alert={alert} onDismiss={dismissAlert} />
        </div>
      ))}
    </div>
  )
}
