import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchActiveStreamers, subscribeToLeaderboardRefresh, type LeaderboardStreamer } from '../lib/globalLeaderboardRealtime'
import { LiveThumbnail } from './LiveThumbnail'
import { WatchModal } from './WatchModal'

interface ArenaWheelProps {
  clerkUserId: string | null
  authUserId?: string | null
  myProfileId: string | null
  onTokenEconomyChanged?: () => void
  onPopOutWithLeaderboard?: (s: LeaderboardStreamer) => void
}

const RADIUS = 380
const SLOT_WIDTH = 280

export function ArenaWheel({ clerkUserId, authUserId, myProfileId, onTokenEconomyChanged, onPopOutWithLeaderboard }: ArenaWheelProps) {
  const [rows, setRows] = useState<LeaderboardStreamer[]>([])
  const [loading, setLoading] = useState(true)
  const [rotation, setRotation] = useState(0)
  const [watching, setWatching] = useState<LeaderboardStreamer | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const wheelTimerRef = useRef<number | null>(null)
  const dragRef = useRef<{ startX: number; startRot: number; moved: boolean } | null>(null)

  const N = rows.length
  const angleStep = N > 0 ? 360 / N : 0
  const frontIdx = N > 0 ? ((-Math.round(rotation / angleStep)) % N + N) % N : 0

  const load = useCallback(async () => {
    try { setRows(await fetchActiveStreamers()) }
    catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    void load()
    let unsub: (() => void) | null = null
    try { unsub = subscribeToLeaderboardRefresh(() => { void load() }) } catch { /* ignore */ }
    return () => { if (unsub) unsub() }
  }, [load])

  const snap = useCallback((delta: number) => {
    setRotation((r) => r + delta * angleStep)
  }, [angleStep])

  // Wheel listener attached imperatively so we can call preventDefault
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (N === 0) return
      e.preventDefault()
      if (wheelTimerRef.current) return
      wheelTimerRef.current = window.setTimeout(() => { wheelTimerRef.current = null }, 220)
      snap(e.deltaY > 0 ? -1 : 1)
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [N, snap])

  const onPointerDown = (e: React.PointerEvent) => {
    if (N === 0) return
    dragRef.current = { startX: e.clientX, startRot: rotation, moved: false }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    if (Math.abs(dx) > 4) dragRef.current.moved = true
    setRotation(dragRef.current.startRot + dx * 0.3)
  }
  const onPointerUp = () => {
    if (!dragRef.current) return
    setRotation((r) => Math.round(r / angleStep) * angleStep)
    // Don't clear moved here — slot click handler reads it
    setTimeout(() => { dragRef.current = null }, 0)
  }

  const handleSlotClick = (row: LeaderboardStreamer, idx: number) => {
    if (dragRef.current?.moved) return
    if (idx === frontIdx) {
      setWatching(row)
    } else {
      const target = -idx * angleStep
      const current = rotation
      // Shortest signed angular distance
      const diff = ((target - current + 540) % 360) - 180
      setRotation(current + diff)
    }
  }

  return (
    <>
      {watching && (
        <WatchModal
          streamer={watching}
          clerkUserId={clerkUserId}
          authUserId={authUserId}
          myProfileId={myProfileId}
          onClose={() => setWatching(null)}
          onTokenEconomyChanged={onTokenEconomyChanged}
          onPopOutWithLeaderboard={onPopOutWithLeaderboard ? () => { onPopOutWithLeaderboard(watching); setWatching(null) } : undefined}
        />
      )}

      {loading ? (
        <div className="arena-wheel arena-wheel--empty">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>Loading streamers...</p>
        </div>
      ) : N === 0 ? (
        <div className="arena-wheel arena-wheel--empty">
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted)' }}>
            No active streamers. Be the first — click GO LIVE.
          </p>
        </div>
      ) : (
        <div className="arena-wheel">
          <div
            ref={stageRef}
            className="arena-wheel__stage"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            role="region"
            aria-label="Streamer carousel"
          >
            <div
              className="arena-wheel__ring"
              style={{ transform: `translateZ(-${RADIUS}px) rotateY(${rotation}deg)` }}
            >
              {rows.map((row, i) => {
                const slotAngle = i * angleStep
                const isFront = i === frontIdx
                return (
                  <div
                    key={row.sessionId}
                    className={`arena-wheel__slot${isFront ? ' arena-wheel__slot--front' : ''}`}
                    style={{
                      transform: `rotateY(${slotAngle}deg) translateZ(${RADIUS}px)`,
                      width: SLOT_WIDTH,
                      marginLeft: -SLOT_WIDTH / 2,
                    }}
                    onClick={() => handleSlotClick(row, i)}
                  >
                    <LiveThumbnail streamer={row} onClick={() => handleSlotClick(row, i)} />
                    <div className="arena-wheel__label">
                      <div className="arena-wheel__name">{row.avatarEmoji ?? '🎧'} {row.username}</div>
                      <div className="arena-wheel__quest">{row.quest}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="arena-wheel__controls">
            <button type="button" className="btn btn-ghost" onClick={() => snap(1)} aria-label="Previous">‹ PREV</button>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
              {frontIdx + 1} / {N} · scroll, drag, or arrows
            </span>
            <button type="button" className="btn btn-ghost" onClick={() => snap(-1)} aria-label="Next">NEXT ›</button>
          </div>
        </div>
      )}
    </>
  )
}
