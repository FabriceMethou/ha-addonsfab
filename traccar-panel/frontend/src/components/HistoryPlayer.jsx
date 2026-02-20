import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import { format, parseISO } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'
import { createAnimation } from '../utils/tripAnimation.js'
import { routeDistanceKm } from '../utils/haversine.js'

const SPEED_MULTIPLIERS = [1, 5, 10, 30]

function speedColor(kmh) {
  if (kmh < 30) return '#22C55E'
  if (kmh < 80) return '#F59E0B'
  return '#EF4444'
}

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

const pinIcon = (color) =>
  L.divIcon({
    html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.4)"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    className: '',
  })

// Controls panel (always visible in sidebar)
// overlayRef is provided by App and shared with HistoryOverlay inside MapContainer
export function HistoryControls({ mapRef, overlayRef }) {
  const devices = useTraccarStore((s) => s.devices)
  const [deviceId, setDeviceId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('idle') // idle | loading | playing | paused
  const [speed, setSpeed] = useState(1)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [points, setPoints] = useState([])
  const animRef = useRef(null)

  // Default date range: last 24 h
  useEffect(() => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000)
    setFrom(format(yesterday, "yyyy-MM-dd'T'HH:mm"))
    setTo(format(now, "yyyy-MM-dd'T'HH:mm"))
    if (devices.length > 0) setDeviceId(String(devices[0].id))
  }, [devices])

  const onUpdate = useCallback(
    ({ lat, lon, speed: spd, progress: prog }) => {
      overlayRef.current.markerPos = [lat, lon]
      setProgress(prog)
      if (animRef.current) {
        setElapsed(Math.round(prog * animRef.current.totalDurationMs))
      }
    },
    []
  )

  async function handleLoad() {
    if (!deviceId || !from || !to) return
    animRef.current?.destroy()
    animRef.current = null
    setPoints([])
    setStatus('loading')
    setError(null)
    setProgress(0)
    setElapsed(0)
    setStats(null)

    try {
      const fromISO = new Date(from).toISOString()
      const toISO = new Date(to).toISOString()
      const res = await fetch(
        `./api/reports/route?deviceId=${deviceId}&from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      if (!data || data.length === 0) {
        setError('No data for selected range.')
        setStatus('idle')
        return
      }
      if (data.length > 10000) {
        console.warn(`Large route: ${data.length} points`)
      }

      setPoints(data)
      overlayRef.current.points = data
      overlayRef.current.markerPos = [data[0].latitude, data[0].longitude]

      const dist = routeDistanceKm(data)
      const durMs = new Date(data[data.length - 1].fixTime).getTime() - new Date(data[0].fixTime).getTime()
      const maxSpd = Math.max(...data.map((p) => (p.speed ?? 0) * 1.852))
      const avgSpd = durMs > 0 ? dist / (durMs / 3600000) : 0
      setStats({ dist, durMs, maxSpd, avgSpd })

      const anim = createAnimation(data, onUpdate)
      animRef.current = anim

      // Fly map to start
      if (mapRef?.current) {
        mapRef.current.flyTo([data[0].latitude, data[0].longitude], 13)
      }

      setStatus('paused')
    } catch (err) {
      setError(err.message)
      setStatus('idle')
    }
  }

  function handlePlay() {
    animRef.current?.play(speed)
    setStatus('playing')
  }

  function handlePause() {
    animRef.current?.pause()
    setStatus('paused')
  }

  function handleStop() {
    animRef.current?.stop()
    setStatus('paused')
    setProgress(0)
    setElapsed(0)
  }

  function handleSpeedChange(s) {
    setSpeed(s)
    if (status === 'playing') {
      animRef.current?.pause()
      animRef.current?.play(s)
    }
  }

  function handleSeek(e) {
    const frac = parseFloat(e.target.value)
    animRef.current?.seek(frac)
    setProgress(frac)
    if (animRef.current) setElapsed(Math.round(frac * animRef.current.totalDurationMs))
  }

  return (
    <>
      {/* Controls */}
      <div className="px-3 py-2 space-y-2 border-b border-gray-200 dark:border-gray-700">
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1"
        >
          {devices.map((d) => (
            <option key={d.id} value={String(d.id)}>
              {d.name}
            </option>
          ))}
        </select>
        <div className="flex gap-1">
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="flex-1 text-xs rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1"
          />
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="flex-1 text-xs rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1"
          />
        </div>
        <button
          onClick={handleLoad}
          disabled={status === 'loading'}
          className="w-full py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {status === 'loading' ? 'Loading...' : 'Load Route'}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Playback controls */}
      {points.length > 0 && (
        <div className="px-3 py-2 space-y-2">
          <div className="flex gap-1 items-center">
            <button
              onClick={status === 'playing' ? handlePause : handlePlay}
              disabled={!animRef.current}
              className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
            >
              {status === 'playing' ? '⏸' : '▶'}
            </button>
            <button
              onClick={handleStop}
              className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded"
            >
              ⏹
            </button>
            <div className="flex gap-1 ml-auto">
              {SPEED_MULTIPLIERS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSpeedChange(s)}
                  className={`px-2 py-0.5 text-xs rounded ${
                    speed === s
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={progress}
            onChange={handleSeek}
            className="w-full"
          />

          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{formatMs(elapsed)}</span>
            <span>{stats ? formatMs(stats.durMs) : '--'}</span>
          </div>

          {stats && (
            <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-3 flex-wrap">
              <span>Dist: {stats.dist.toFixed(1)} km</span>
              <span>Max: {Math.round(stats.maxSpd)} km/h</span>
              <span>Avg: {Math.round(stats.avgSpd)} km/h</span>
            </div>
          )}
        </div>
      )}

    </>
  )
}

// Renders the route polyline and animated marker on the map
// Must be rendered inside MapContainer
export function HistoryOverlay({ overlayRef }) {
  const [, rerender] = useState(0)

  // Subscribe to animation updates
  useEffect(() => {
    const id = setInterval(() => rerender((n) => n + 1), 50)
    return () => clearInterval(id)
  }, [])

  const { points, markerPos } = overlayRef?.current ?? {}
  if (!points || points.length < 2) return null

  // Build speed-colored segments
  const segments = []
  for (let i = 1; i < points.length; i++) {
    const kmh = (points[i - 1].speed ?? 0) * 1.852
    segments.push({
      positions: [
        [points[i - 1].latitude, points[i - 1].longitude],
        [points[i].latitude, points[i].longitude],
      ],
      color: speedColor(kmh),
    })
  }

  return (
    <>
      {segments.map((seg, i) => (
        <Polyline key={i} positions={seg.positions} pathOptions={{ color: seg.color, weight: 3 }} />
      ))}
      <Marker
        position={[points[0].latitude, points[0].longitude]}
        icon={pinIcon('#22C55E')}
      />
      <Marker
        position={[points[points.length - 1].latitude, points[points.length - 1].longitude]}
        icon={pinIcon('#EF4444')}
      />
      {markerPos && (
        <Marker position={markerPos} icon={pinIcon('#3B82F6')} />
      )}
    </>
  )
}
