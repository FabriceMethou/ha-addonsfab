import { useEffect } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'

/**
 * Fetches initial Traccar data on mount: devices, positions, geofences.
 * Re-fetches whenever `refreshToken` changes (manual refresh button).
 * All fetch calls use relative paths so they work at any ingress prefix.
 */
export function useTraccar() {
  const { setDevices, setPositions, setGeofences, setLoading, setError } = useTraccarStore()
  const refreshToken = useTraccarStore((s) => s.refreshToken)

  useEffect(() => {
    let cancelled = false

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
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [setDevices, setPositions, setGeofences, setLoading, setError, refreshToken])
}
