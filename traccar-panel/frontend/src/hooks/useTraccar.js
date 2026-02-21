import { useEffect } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'

/**
 * Fetches initial Traccar data on mount: devices, positions, geofences.
 * Re-fetches whenever `refreshToken` changes (manual refresh button).
 * All fetch calls use relative paths so they work at any ingress prefix.
 */
export function useTraccar() {
  const { setDevices, setPositions, setGeofences, setLoading, setError, seedGeofenceArrivals } = useTraccarStore()
  const refreshToken = useTraccarStore((s) => s.refreshToken)

  useEffect(() => {
    let cancelled = false

    async function backfillArrivals(devices) {
      try {
        const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        const to = new Date().toISOString()
        const params = new URLSearchParams({ from, to, type: 'geofenceEnter' })
        devices.forEach((d) => params.append('deviceId', d.id))
        const res = await fetch(`./api/reports/events?${params}`)
        if (!res.ok) return
        const events = await res.json()
        if (!Array.isArray(events)) return
        const arrivals = {}
        for (const ev of events) {
          if (!arrivals[ev.deviceId]) arrivals[ev.deviceId] = {}
          const t = new Date(ev.eventTime).getTime()
          if (!arrivals[ev.deviceId][ev.geofenceId] || t > arrivals[ev.deviceId][ev.geofenceId]) {
            arrivals[ev.deviceId][ev.geofenceId] = t
          }
        }
        if (!cancelled) seedGeofenceArrivals(arrivals)
      } catch { /* non-critical: "since X" just won't show for pre-existing arrivals */ }
    }

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const [devicesRes, positionsRes, geofencesRes] = await Promise.all([
          fetch('./api/devices'),
          fetch('./api/positions'),
          fetch('./api/geofences'),
        ])

        if (!devicesRes.ok || !positionsRes.ok || !geofencesRes.ok) {
          throw new Error('Failed to load Traccar data')
        }

        const [devices, positions, geofences] = await Promise.all([
          devicesRes.json(),
          positionsRes.json(),
          geofencesRes.json(),
        ])

        if (!cancelled) {
          setDevices(devices)
          setPositions(positions)
          setGeofences(geofences)
          // Backfill geofence arrival times from last 24h (fire-and-forget, non-blocking)
          backfillArrivals(devices)
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [setDevices, setPositions, setGeofences, setLoading, setError, seedGeofenceArrivals, refreshToken])
}
