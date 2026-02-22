const STORAGE_KEY = 'arrivalRules'

/**
 * Rule shape:
 * {
 *   id: string,
 *   deviceId: number,
 *   geofenceId: number,
 *   time: string (HH:MM),
 *   days: number[] (0=Sun, 1=Mon, ..., 6=Sat),
 *   enabled: boolean,
 * }
 */

export function loadRules() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveRules(rules) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules))
}

export function addRule(rule) {
  const rules = loadRules()
  rules.push({ ...rule, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` })
  saveRules(rules)
  return rules
}

export function removeRule(id) {
  const rules = loadRules().filter((r) => r.id !== id)
  saveRules(rules)
  return rules
}

export function toggleRule(id) {
  const rules = loadRules().map((r) =>
    r.id === id ? { ...r, enabled: !r.enabled } : r
  )
  saveRules(rules)
  return rules
}

/**
 * Evaluate all enabled rules against current geofence presence.
 * Returns an array of { rule, deviceName, geofenceName } for triggered rules
 * (device NOT in geofence after the deadline, within a 60-minute window).
 */
export function evaluateRules(rules, positions, devices, geofences) {
  const now = new Date()
  const currentDay = now.getDay()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()
  const triggered = []

  for (const rule of rules) {
    if (!rule.enabled) continue
    if (!rule.days.includes(currentDay)) continue

    const [hh, mm] = rule.time.split(':').map(Number)
    const ruleMinutes = hh * 60 + mm

    // Only trigger if we are past the deadline (within 60-minute window)
    if (currentMinutes < ruleMinutes || currentMinutes > ruleMinutes + 60) continue

    // Check if device is currently in the specified geofence
    const pos = positions[rule.deviceId]
    const isPresent = pos?.geofenceIds?.includes(rule.geofenceId)
    if (isPresent) continue // Device is there — no alert needed

    const device = devices.find((d) => d.id === rule.deviceId)
    const geofence = geofences.find((g) => g.id === rule.geofenceId)
    if (!device || !geofence) continue

    triggered.push({ rule, deviceName: device.name, geofenceName: geofence.name })
  }

  return triggered
}
