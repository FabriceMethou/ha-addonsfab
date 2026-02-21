import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Polyline, Marker } from 'react-leaflet'
import L from 'leaflet'
import { format, subDays } from 'date-fns'
import useTraccarStore from '../store/useTraccarStore.js'
import { createAnimation } from '../utils/tripAnimation.js'
import { routeDistanceKm } from '../utils/haversine.js'
import TripsList from './TripsList.jsx'
import StopsList from './StopsList.jsx'
import DayTimeline from './DayTimeline.jsx'

const KNOTS_TO_KMH = 1.852
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

// ── Controls (sidebar) ────────────────────────────────────────────────────────
export function HistoryControls({ mapRef }) {
  const devices = useTraccarStore((s) => s.devices)
  const { setAnimatedRoute, setAnimatedMarker, clearAnimation } = useTraccarStore()

  const [deviceId, setDeviceId] = useState('')
  const [mode, setMode] = useState('timeline') // 'timeline' | 'trips' | 'stops' | 'custom'
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [playbackStatus, setPlaybackStatus] = useState('idle')
  const [speed, setSpeed] = useState(1)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)
  const [hasRoute, setHasRoute] = useState(false)
  const [selectedTripStart, setSelectedTripStart] = useState(null) // highlights active trip in list
  const [tripInfo, setTripInfo] = useState(null) // {startAddress, endAddress} from selected trip

  const animRef = useRef(null)
  const abortRef = useRef(null) // AbortController for in-flight fetches
  const autoLoadAbortRef = useRef(null) // separate controller for auto-load fetch

  // Default device
  useEffect(() => {
    if (devices.length > 0 && !deviceId) setDeviceId(String(devices[0].id))
    const now = new Date()
    setFrom(format(new Date(now - 24 * 3600 * 1000), "yyyy-MM-dd'T'HH:mm"))
    setTo(format(now, "yyyy-MM-dd'T'HH:mm"))
  }, [devices]) // eslint-disable-line

  // Clean up when device changes
  useEffect(() => {
    if (!deviceId) return
    autoLoadAbortRef.current?.abort()
    abortRef.current?.abort()
    animRef.current?.destroy()
    animRef.current = null
    clearAnimation()
    setHasRoute(false)
    setPlaybackStatus('idle')
    setProgress(0)
    setElapsed(0)
    setStats(null)
    setError(null)
    setSelectedTripStart(null)
  }, [deviceId]) // eslint-disable-line

  // Auto-load the most recent trip whenever the device is (re)selected.
  // Skip when mode==='trips'/'timeline' to avoid duplicate /api/reports/trips fetches.
  useEffect(() => {
    if (!deviceId || mode === 'trips' || mode === 'timeline') return
    let cancelled = false
    const controller = new AbortController()
    autoLoadAbortRef.current = controller

    async function autoLoad() {
      try {
        const from = subDays(new Date(), 30).toISOString()
        const to = new Date().toISOString()
        const res = await fetch(
          `./api/reports/trips?deviceId=${deviceId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
          { signal: controller.signal }
        )
        if (!res.ok || cancelled) return
        const trips = await res.json()
        if (cancelled || !trips || trips.length === 0) return
        // Traccar returns trips in chronological order — take the last one
        const latest = trips[trips.length - 1]
        if (!cancelled) {
          setSelectedTripStart(latest.startTime)
          loadRoute(latest.startTime, latest.endTime, {
            dist: (latest.distance ?? 0) / 1000,
            durMs: latest.duration ?? 0,
            maxSpd: (latest.maxSpeed ?? 0) * KNOTS_TO_KMH,
            avgSpd: (latest.averageSpeed ?? 0) * KNOTS_TO_KMH,
          })
        }
      } catch {
        // AbortError or network issue — silent, user can select manually
      }
    }

    autoLoad()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [deviceId]) // eslint-disable-line

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      animRef.current?.destroy()
      clearAnimation()
    }
  }, []) // eslint-disable-line

  const onUpdate = useCallback(({ lat, lon, progress: prog }) => {
    setAnimatedMarker({ lat, lon })
    setProgress(prog)
    if (animRef.current) setElapsed(Math.round(prog * animRef.current.totalDurationMs))
  }, [setAnimatedMarker])

  async function loadRoute(fromISO, toISO, prefetchedStats = null) {
    if (!deviceId) return

    // Cancel any previous in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    // Tear down old animation
    animRef.current?.destroy()
    animRef.current = null
    clearAnimation()
    setHasRoute(false)
    setPlaybackStatus('loading')
    setError(null)
    setProgress(0)
    setElapsed(0)
    setStats(prefetchedStats) // show Traccar's pre-calculated stats immediately

    try {
      const res = await fetch(
        `./api/reports/route?deviceId=${deviceId}&from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`,
        { signal: controller.signal }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      if (!data || data.length === 0) {
        setError('No GPS data for this period.')
        setPlaybackStatus('idle')
        return
      }
      if (data.length > 10000) console.warn(`Large route: ${data.length} points`)

      setAnimatedRoute(data)

      // Recalculate stats from actual GPS points (more accurate than trip summary)
      const dist = routeDistanceKm(data)
      const durMs =
        new Date(data[data.length - 1].fixTime).getTime() -
        new Date(data[0].fixTime).getTime()
      const maxSpd = Math.max(...data.map((p) => (p.speed ?? 0) * KNOTS_TO_KMH))
      const avgSpd = durMs > 0 ? dist / (durMs / 3_600_000) : 0
      setStats({ dist, durMs, maxSpd, avgSpd })

      const anim = createAnimation(data, onUpdate)
      animRef.current = anim
      setHasRoute(true)

      if (mapRef?.current) mapRef.current.flyTo([data[0].latitude, data[0].longitude], 13)
      setPlaybackStatus('paused')
    } catch (err) {
      if (err.name === 'AbortError') return // superseded by newer request — silent
      setError(err.message)
      setPlaybackStatus('idle')
    }
  }

  function handleSelectTrip(trip) {
    setSelectedTripStart(trip.startTime)
    setTripInfo({
      startAddress: trip.startAddress ?? null,
      endAddress: trip.endAddress ?? null,
    })
    loadRoute(trip.startTime, trip.endTime, {
      dist: (trip.distance ?? 0) / 1000,
      durMs: trip.duration ?? 0,
      maxSpd: (trip.maxSpeed ?? 0) * KNOTS_TO_KMH,
      avgSpd: (trip.averageSpeed ?? 0) * KNOTS_TO_KMH,
    })
  }

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
    setAnimatedMarker(null)
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
          onChange={(e) => setDeviceId(e.target.value)}
          className="w-full text-sm rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1"
        >
          {devices.map((d) => (
            <option key={d.id} value={String(d.id)}>{d.name}</option>
          ))}
        </select>
      </div>

      {/* Mode toggle */}
      <div className="flex mx-3 mb-2 rounded overflow-hidden border border-gray-200 dark:border-gray-600">
        {[
          { key: 'timeline', label: 'Day' },
          { key: 'trips',    label: 'Trips' },
          { key: 'stops',    label: 'Stops' },
          { key: 'custom',   label: 'Custom' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setMode(key)}
            className={`flex-1 py-1 text-xs ${
              mode === key
                ? 'bg-blue-500 text-white'
                : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Day timeline (default mode) */}
      {mode === 'timeline' && (
        <DayTimeline
          deviceId={deviceId}
          onSelectTrip={handleSelectTrip}
          selectedStartTime={selectedTripStart}
        />
      )}

      {/* Trips list */}
      {mode === 'trips' && (
        <TripsList
          deviceId={deviceId}
          onSelectTrip={handleSelectTrip}
          selectedStartTime={selectedTripStart}
        />
      )}

      {/* Stops list */}
      {mode === 'stops' && (
        <StopsList deviceId={deviceId} mapRef={mapRef} />
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
        </div>
      )}

      {/* Error (always visible when set) */}
      {error && (
        <p className="text-xs text-red-500 px-3 py-1">{error}</p>
      )}

      {/* Loading indicator */}
      {playbackStatus === 'loading' && (
        <p className="text-xs text-gray-400 dark:text-gray-500 px-3 py-1">Loading route...</p>
      )}

      {/* Trip start → end summary */}
      {hasRoute && tripInfo && (tripInfo.startAddress || tripInfo.endAddress) && (
        <div className="px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 mt-1">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            <span className="text-green-600 dark:text-green-400">▲</span>{' '}
            {tripInfo.startAddress ?? '—'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            <span className="text-red-500 dark:text-red-400">▼</span>{' '}
            {tripInfo.endAddress ?? '—'}
          </p>
        </div>
      )}

      {/* Playback controls */}
      {hasRoute && (
        <div className="px-3 py-2 space-y-2 border-t border-gray-200 dark:border-gray-700 mt-2">
          <div className="flex gap-1 items-center">
            <button
              onClick={playbackStatus === 'playing' ? handlePause : handlePlay}
              className="px-3 py-1 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded"
            >
              {playbackStatus === 'playing' ? '⏸' : '▶'}
            </button>
            <button
              onClick={handleStop}
              className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded"
            >
              ⏹
            </button>
            <button
              onClick={() => {
                animRef.current?.stop()
                setProgress(0)
                setElapsed(0)
                setAnimatedMarker(null)
                animRef.current?.play(speed)
                setPlaybackStatus('playing')
              }}
              title="Replay from start"
              className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600 text-white rounded"
            >
              ↺
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
    </div>
  )
}

// ── Map overlay (inside MapContainer) — reads Zustand, no polling ─────────────
export function HistoryOverlay() {
  const route = useTraccarStore((s) => s.animatedRoute)
  const marker = useTraccarStore((s) => s.animatedMarker)
  const selectedStop = useTraccarStore((s) => s.selectedStop)

  // Stop marker: rendered even when no route is loaded
  const stopMarker =
    selectedStop?.latitude != null ? (
      <Marker
        position={[selectedStop.latitude, selectedStop.longitude]}
        icon={pinIcon('#F59E0B')}
      />
    ) : null

  if (!route || route.length < 2) return <>{stopMarker}</>

  // Speed-coloured segments
  const segments = []
  for (let i = 1; i < route.length; i++) {
    const kmh = (route[i - 1].speed ?? 0) * KNOTS_TO_KMH
    segments.push({
      positions: [
        [route[i - 1].latitude, route[i - 1].longitude],
        [route[i].latitude, route[i].longitude],
      ],
      color: speedColor(kmh),
    })
  }

  return (
    <>
      {segments.map((seg, i) => (
        <Polyline key={i} positions={seg.positions} pathOptions={{ color: seg.color, weight: 3 }} />
      ))}
      <Marker position={[route[0].latitude, route[0].longitude]} icon={pinIcon('#22C55E')} />
      <Marker
        position={[route[route.length - 1].latitude, route[route.length - 1].longitude]}
        icon={pinIcon('#EF4444')}
      />
      {marker && <Marker position={[marker.lat, marker.lon]} icon={pinIcon('#3B82F6')} />}
      {stopMarker}
    </>
  )
}
