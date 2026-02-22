import { useEffect, useRef } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'
import { loadRules, evaluateRules } from '../utils/arrivalRules.js'

const CHECK_INTERVAL_MS = 60000

/**
 * Checks arrival rules every 60 seconds.
 * Fires a "noShow" alert when a device hasn't arrived at a geofence by the scheduled time.
 * Tracks already-alerted rule+date combos to prevent duplicates within the same day.
 */
export function useArrivalRuleChecker() {
  const alertedRef = useRef(new Set())

  useEffect(() => {
    function check() {
      const { positions, devices, geofences, pushAlert } = useTraccarStore.getState()
      const rules = loadRules()
      if (rules.length === 0) return

      const triggered = evaluateRules(rules, positions, devices, geofences)
      const today = new Date().toDateString()

      for (const { rule, deviceName, geofenceName } of triggered) {
        const key = `${rule.id}-${today}`
        if (alertedRef.current.has(key)) continue
        alertedRef.current.add(key)
        pushAlert({
          type: 'noShow',
          deviceName,
          geofenceName,
          ts: Date.now(),
        })
      }
    }

    // Run immediately on mount, then every 60s
    check()
    const id = setInterval(check, CHECK_INTERVAL_MS)
    return () => clearInterval(id)
  }, [])
}
