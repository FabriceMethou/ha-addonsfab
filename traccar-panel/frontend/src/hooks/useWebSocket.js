import { useEffect, useRef } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'

const PING_INTERVAL_MS = 30_000   // send ping every 30 s
const WATCHDOG_TIMEOUT_MS = 75_000 // force-reconnect if no message for 75 s

/**
 * Maintains a WebSocket connection to the BFF relay.
 * URL is derived from window.location so it works at any ingress prefix.
 *
 * Handles:
 *   data.positions  → updatePosition per device + battery check
 *   data.devices    → patch device status (online/offline)
 *   data.events     → geofenceEnter / geofenceExit / deviceOverspeed → push alert
 *   data.type=pong  → heartbeat acknowledgement (resets watchdog)
 */
export function useWebSocket() {
  const { updatePosition, setConnected, handleWsEvent, checkBatteryAlert, patchDevices } = useTraccarStore()

  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const pingTimer = useRef(null)
  const watchdogTimer = useRef(null)

  useEffect(() => {
    let active = true

    function resetWatchdog(ws) {
      clearTimeout(watchdogTimer.current)
      watchdogTimer.current = setTimeout(() => {
        // No message received — connection may be silently dead
        ws.close()
      }, WATCHDOG_TIMEOUT_MS)
    }

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
        resetWatchdog(ws)

        // Send a ping every 30 s to keep the connection alive
        clearInterval(pingTimer.current)
        pingTimer.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, PING_INTERVAL_MS)
      }

      ws.onmessage = (event) => {
        resetWatchdog(ws) // any incoming message resets the watchdog

        try {
          const data = JSON.parse(event.data)

          // Heartbeat acknowledgement — no further action needed
          if (data.type === 'pong') return

          if (Array.isArray(data.positions)) {
            for (const pos of data.positions) {
              updatePosition(pos)
              checkBatteryAlert(pos)
            }
          }

          // Patch online/offline status into existing device list
          if (Array.isArray(data.devices)) {
            patchDevices(data.devices)
          }

          if (Array.isArray(data.events)) {
            for (const ev of data.events) {
              handleWsEvent(ev)
            }
          }
        } catch {
          // ignore malformed frames
        }
      }

      ws.onclose = () => {
        clearInterval(pingTimer.current)
        clearTimeout(watchdogTimer.current)
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
      clearInterval(pingTimer.current)
      clearTimeout(watchdogTimer.current)
      wsRef.current?.close()
    }
  }, [updatePosition, setConnected, handleWsEvent, checkBatteryAlert, patchDevices])
}
