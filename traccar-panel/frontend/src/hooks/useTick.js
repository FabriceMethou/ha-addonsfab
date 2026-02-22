import { useState, useEffect } from 'react'

/**
 * Returns a counter that increments every `intervalMs` milliseconds.
 * Components subscribing to this will re-render on each tick,
 * keeping time-dependent displays (dwell time, offline duration) fresh.
 */
export function useTick(intervalMs = 60000) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return tick
}
