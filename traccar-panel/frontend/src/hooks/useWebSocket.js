import { useEffect, useRef } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'

/**
 * Maintains a WebSocket connection to the BFF relay.
 * URL is derived from window.location so it works at any ingress prefix.
 */
export function useWebSocket() {
  const { updatePosition, setConnected } = useTraccarStore()
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)

  useEffect(() => {
    let active = true

    function connect() {
      if (!active) return

      // Derive WS URL from current page location (ingress-path-aware)
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
          // Traccar WS pushes {positions: [...], devices: [...], events: [...]}
          if (data.positions) {
            for (const pos of data.positions) {
              updatePosition(pos)
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

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      active = false
      clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [updatePosition, setConnected])
}
