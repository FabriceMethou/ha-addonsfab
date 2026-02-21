import { useEffect, useRef } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'

/**
 * Maintains a WebSocket connection to the BFF relay.
 * URL is derived from window.location so it works at any ingress prefix.
 *
 * Handles:
 *   data.positions  → updatePosition per device
 *   data.devices    → patch device status (online/offline)
 *   data.events     → geofenceEnter / geofenceExit → push alert
 */
export function useWebSocket() {
  const { updatePosition, setConnected, handleWsEvent, checkBatteryAlert } = useTraccarStore()
  const setDevices = useTraccarStore((s) => s.setDevices)
  const devicesRef = useRef(useTraccarStore.getState().devices)

  // Keep a ref to current devices so WS handler doesn't stale-close over them
  useEffect(() => {
    return useTraccarStore.subscribe(
      (state) => { devicesRef.current = state.devices }
    )
  }, [])

  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)

  useEffect(() => {
    let active = true

    function connect() {
      if (!active) return

      const base = window.location.pathname.replace(/\/$/, '')
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const url = `${proto}//${window.location.host}${base}/ws`

      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        if (!active) { ws.close(); return }
        setConnected(true)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.positions) {
            for (const pos of data.positions) {
              updatePosition(pos)
              checkBatteryAlert(pos)
            }
          }

          // Patch online/offline status into existing device list
          if (data.devices) {
            const current = devicesRef.current
            const patchMap = {}
            for (const d of data.devices) patchMap[d.id] = d
            const patched = current.map((d) =>
              patchMap[d.id] ? { ...d, ...patchMap[d.id] } : d
            )
            useTraccarStore.setState({ devices: patched })
          }

          // Geofence enter/exit events
          if (data.events) {
            for (const ev of data.events) {
              handleWsEvent(ev)
            }
          }
        } catch {
          // ignore malformed frames
        }
      }

      ws.onclose = () => {
        if (!active) return
        setConnected(false)
        reconnectTimer.current = setTimeout(connect, 5000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      active = false
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [updatePosition, setConnected, handleWsEvent, checkBatteryAlert])
}
