import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import { format } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'
import { createAnimation } from '../utils/tripAnimation.js'
import { routeDistanceKm } from '../utils/haversine.js'
import TripsList from './TripsList.jsx'

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

// ── Controls (rendered in sidebar) ───────────────────────────────────────────
// overlayRef is provided by App and shared with HistoryOverlay inside MapContainer
export function HistoryControls({ mapRef, overlayRef }) {
  const devices = useTraccarStore((s) => s.devices)
  const [deviceId, setDeviceId] = useState('')
  const [mode, setMode] = useState('trips') // 'trips' | 'custom'
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [playbackStatus, setPlaybackStatus] = useState('idle') // idle | loading | playing | paused
  const [speed, setSpeed] = useState(1)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [points, setPoints] = useState([])
  const animRef = useRef(null)

  // Default device + date range
  useEffect(() => {
    if (devices.length > 0 && !deviceId) setDeviceId(String(devices[0].id))
    const now = new Date()
    const yesterday = new Date(now.getTime() - 24 * 3600 * 1000)
    setFrom(format(yesterday, "yyyy-MM-dd'T'HH:mm"))
    setTo(format(now, "yyyy-MM-dd'T'HH:mm"))
  }, [devices]) // eslint-disable-line

  const onUpdate = useCallback(({ lat, lon, speed: spd, progress: prog }) => {
    if (overlayRef) overlayRef.current.markerPos = [lat, lon]
    setProgress(prog)
    if (animRef.current) setElapsed(Math.round(prog * animRef.current.totalDurationMs))
  }, [overlayRef])

  async function loadRoute(fromISO, toISO) {
    if (!deviceId) return
    animRef.current?.destroy()
    animRef.current = null
    setPoints([])
    if (overlayRef) overlayRef.current = { points: [], markerPos: null }
    setPlaybackStatus('loading')
    setError(null)
    setProgress(0)
    setElapsed(0)
    setStats(null)

    try {
      const res = await fetch(
        `./api/reports/route?deviceId=${deviceId}&from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      if (!data || data.length === 0) {
        setError('No GPS data for this period.')
        setPlaybackStatus('idle')
        return
      }
      if (data.length > 10000) console.warn(`Large route: ${data.length} points`)

      setPoints(data)
      if (overlayRef) {
        overlayRef.current.points = data
        overlayRef.current.markerPos = [data[0].latitude, data[0].longitude]
      }

      const dist = routeDistanceKm(data)
      const durMs =
        new Date(data[data.length - 1].fixTime).getTime() - new Date(data[0].fixTime).getTime()
      const maxSpd = Math.max(...data.map((p) => (p.speed ?? 0) * 1.852))
      const avgSpd = durMs > 0 ? dist / (durMs / 3600000) : 0
      setStats({ dist, durMs, maxSpd, avgSpd })

      const anim = createAnimation(data, onUpdate)
      animRef.current = anim

      if (mapRef?.current) mapRef.current.flyTo([data[0].latitude, data[0].longitude], 13)
      setPlaybackStatus('paused')
    } catch (err) {
      setError(err.message)
      setPlaybackStatus('idle')
    }
  }

  // Called when user clicks a trip in TripsList
  function handleSelectTrip({ startTime, endTime }) {
    loadRoute(startTime, endTime)
  }

  // Called when user clicks Load in manual mode
  function handleManualLoad() {
    if (!from || !to) return
    loadRoute(new Date(from).toISOString(), new Date(to).toISOString())
  }

  function handlePlay() {
    animRef.current?.play(speed)
    setPlaybackStatus('playing')
  }

  function handlePause() {
    animRef.current?.pause()
    setPlaybackStatus('paused')
  }

  function handleStop() {
    animRef.current?.stop()
    setPlaybackStatus('paused')
    setProgress(0)
    setElapsed(0)
  }

  function handleSpeedChange(s) {
    setSpeed(s)
    if (playbackStatus === 'playing') {
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
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Device selector */}
      <div className="px-3 pt-2 pb-1">
        <select
          value={deviceId}
          onChange={(e) => { setDeviceId(e.target.value); setPoints([]) }}
          className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1"
        >
          {devices.map((d) => (
            <option key={d.id} value={String(d.id)}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Mode toggle */}
      <div className="flex mx-3 mb-2 rounded overflow-hidden border border-gray-200 dark:border-gray-600">
        <button
          onClick={() => setMode('trips')}
          className={`flex-1 py-1 text-xs ${mode === 'trips' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
        >
          Trips
        </button>
        <button
          onClick={() => setMode('custom')}
          className={`flex-1 py-1 text-xs ${mode === 'custom' ? 'bg-blue-500 text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
        >
          Custom range
        </button>
      </div>

      {/* Trips list */}
      {mode === 'trips' && (
        <TripsList
          deviceId={deviceId}
          onSelectTrip={handleSelectTrip}
        />
      )}

      {/* Custom date range */}
      {mode === 'custom' && (
        <div className="px-3 space-y-2">
          <input
            type="datetime-local"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-full text-xs rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1"
          />
          <input
            type="datetime-local"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-full text-xs rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1"
          />
          <button
            onClick={handleManualLoad}
            disabled={playbackStatus === 'loading'}
            className="w-full py-1.5 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
          >
            {playbackStatus === 'loading' ? 'Loading...' : 'Load Route'}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {/* Playback controls (shown once a route is loaded) */}
      {points.length > 0 && (
        <div className="px-3 py-2 space-y-2 border-t border-gray-200 dark:border-gray-700 mt-2">
          {mode === 'trips' && error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          {playbackStatus === 'loading' && (
            <p className="text-xs text-gray-400 dark:text-gray-500">Loading route...</p>
          )}

          <div className="flex gap-1 items-center">
            <button
              onClick={playbackStatus === 'playing' ? handlePause : handlePlay}
              disabled={!animRef.current}
              className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded disabled:opacity-50"
            >
              {playbackStatus === 'playing' ? '⏸' : '▶'}
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
              <span>{stats.dist.toFixed(1)} km</span>
              <span>Max {Math.round(stats.maxSpd)} km/h</span>
              <span>Avg {Math.round(stats.avgSpd)} km/h</span>
            </div>
          )}
        </div>
      )}

      {/* Show loading/error for trips mode when no points yet */}
      {points.length === 0 && mode === 'trips' && error && (
        <p className="text-xs text-red-500 px-3 py-1">{error}</p>
      )}
      {points.length === 0 && playbackStatus === 'loading' && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-1">Loading route...</p>
      )}
    </div>
  )
}

// ── Map overlay (inside MapContainer) ────────────────────────────────────────
export function HistoryOverlay({ overlayRef }) {
  const [, rerender] = useState(0)

  useEffect(() => {
    const id = setInterval(() => rerender((n) => n + 1), 50)
    return () => clearInterval(id)
  }, [])

  const { points, markerPos } = overlayRef?.current ?? {}
  if (!points || points.length < 2) return null

  // Speed-coloured segments
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
      <Marker position={[points[0].latitude, points[0].longitude]} icon={pinIcon('#22C55E')} />
      <Marker
        position={[points[points.length - 1].latitude, points[points.length - 1].longitude]}
        icon={pinIcon('#EF4444')}
      />
      {markerPos && <Marker position={markerPos} icon={pinIcon('#3B82F6')} />}
    </>
  )
}
