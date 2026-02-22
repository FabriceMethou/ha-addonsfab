import React, { useState } from 'react'
import useTraccarStore from '../store/useTraccarStore.js'

export default function SOSButton() {
  const devices = useTraccarStore((s) => s.devices)
  const positions = useTraccarStore((s) => s.positions)
  const [sending, setSending] = useState(false)
  const [confirm, setConfirm] = useState(false)

  async function handleSOS() {
    if (!confirm) {
      setConfirm(true)
      setTimeout(() => setConfirm(false), 5000)
      return
    }

    setSending(true)
    setConfirm(false)

    try {
      let lat, lon
      // Try browser geolocation first
      try {
        const geo = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 })
        )
        lat = geo.coords.latitude
        lon = geo.coords.longitude
      } catch {
        // Fallback: use first device's position
        const firstDevice = devices[0]
        const pos = firstDevice ? positions[firstDevice.id] : null
        if (pos) {
          lat = pos.latitude
          lon = pos.longitude
        }
      }

      if (lat == null || lon == null) {
        return
      }

      const senderName = localStorage.getItem('sosName') || devices[0]?.name || 'Unknown'

      await fetch('./sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName: senderName,
          latitude: lat,
          longitude: lon,
          timestamp: Date.now(),
        }),
      })
    } catch (err) {
      console.error('SOS failed:', err)
    } finally {
      setSending(false)
    }
  }

  return (
    <button
      onClick={handleSOS}
      disabled={sending}
      className={`w-full py-2.5 rounded-lg font-bold text-sm transition-colors ${
        confirm
          ? 'bg-red-700 text-white animate-pulse'
          : sending
          ? 'bg-gray-400 text-white cursor-not-allowed'
          : 'bg-red-600 hover:bg-red-700 text-white'
      }`}
    >
      {sending ? 'Sending SOS...' : confirm ? 'TAP AGAIN TO CONFIRM' : 'SOS Emergency'}
    </button>
  )
}
