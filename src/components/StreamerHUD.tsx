import { useEffect, useId, useState } from 'react'

interface StreamerHUDProps {
  taskOfHour: string
  currentHealth: number
  xp: number
  xpToNextLevel: number
  kickBucks: number
  playerName: string
  shieldActive?: boolean
  glitchActive?: boolean
  isStreaming?: boolean
  streamStartTime?: number | null
  isGoLiveMinimized?: boolean
  onExpandGoLive?: () => void
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value))
}

function hpColor(hp: number): string {
  if (hp > 60) return 'var(--green)'
  if (hp > 30) return 'var(--gold)'
  return 'var(--danger)'
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function StreamerHUD({
  taskOfHour,
  currentHealth,
  xp,
  xpToNextLevel,
  kickBucks,
  playerName,
  shieldActive = false,
  glitchActive = false,
  isStreaming = false,
  streamStartTime = null,
  isGoLiveMinimized = false,
  onExpandGoLive,
}: StreamerHUDProps) {
  const [isMinimized, setIsMinimized] = useState(true)
  const [elapsed, setElapsed] = useState(0)
  const sheetId = useId()
  const focusPercent = clampPercent(currentHealth)
  const xpPercent = clampPercent(xpToNextLevel > 0 ? (xp / xpToNextLevel) * 100 : 0)

  useEffect(() => {
    if (!isStreaming || !streamStartTime) { setElapsed(0); return }
    const tick = () => setElapsed(Date.now() - streamStartTime)
    tick()
    const t = window.setInterval(tick, 1000)
    return () => window.clearInterval(t)
  }, [isStreaming, streamStartTime])

  return (
    <aside className="streamer-hud" aria-live="polite">
      {!isMinimized && (
        <div id={sheetId} className="streamer-hud__sheet" role="region" aria-label="Streamer status">

          {/* Minimized stream card — tap to expand */}
          {isStreaming && isGoLiveMinimized && (
            <div className="streamer-hud__row" style={{ background: 'var(--pink-dim)', border: '1px solid var(--pink-border)', borderRadius: 6, padding: '8px 12px', cursor: 'pointer' }} onClick={onExpandGoLive}>
              <div className="live-pulse">
                <div className="live-pulse__dot" />
                <span className="live-pulse__label">LIVE</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: 'var(--text)', flex: 1 }}>
                {formatElapsed(elapsed)} — {taskOfHour || 'Shipping'}
              </span>
              <button type="button" className="btn btn-ghost" style={{ fontSize: '10px', padding: '3px 10px' }} onClick={(e) => { e.stopPropagation(); onExpandGoLive?.() }}>
                ▶ MANAGE
              </button>
            </div>
          )}

          {/* Task row */}
          <div className="streamer-hud__row">
            <div className="live-pulse">
              <div className="live-pulse__dot" />
              <span className="live-pulse__label">LIVE</span>
            </div>
            <span className="streamer-hud__task">{taskOfHour || 'No task set'}</span>
            {isStreaming && elapsed > 0 && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--pink)', flexShrink: 0, fontWeight: 700 }}>
                {formatElapsed(elapsed)}
              </span>
            )}
          </div>

          {/* HP meter */}
          <div className={`streamer-hud__row${glitchActive ? ' streamer-hud__meter--glitch' : ''}`}>
            <span className="streamer-hud__stat">HP</span>
            <div className="streamer-hud__meter-wrap">
              <div className="streamer-hud__meter-track">
                <div className="streamer-hud__meter-fill" style={{ width: `${focusPercent}%`, background: hpColor(currentHealth) }} />
              </div>
              <span className="streamer-hud__stat" style={{ color: hpColor(currentHealth), minWidth: '32px', textAlign: 'right' }}>
                {focusPercent}%
              </span>
            </div>
            {shieldActive && <span className="streamer-hud__shield-note">🛡 SHIELD</span>}
          </div>

          {/* XP + Jerk Bucks */}
          <div className="streamer-hud__row">
            <span className="streamer-hud__stat">XP</span>
            <div className="xp-bar" style={{ flex: 1 }}>
              <div className="xp-bar__track">
                <div className="xp-bar__fill" style={{ width: `${xpPercent}%` }} />
              </div>
              <span className="xp-bar__label">{xp}/{xpToNextLevel}</span>
            </div>
            <div className="streamer-hud__divider" />
            <span className="streamer-hud__stat streamer-hud__stat--gold">⚡ {kickBucks} JB</span>
          </div>

          {glitchActive && (
            <div className="streamer-hud__row">
              <span className="streamer-hud__stat" style={{ color: 'var(--danger)', fontSize: '10px' }}>⚠ PRIORITY GLITCH — teammate spent a jerk token</span>
            </div>
          )}
          {shieldActive && (
            <div className="streamer-hud__row">
              <span className="streamer-hud__stat" style={{ color: 'var(--gold)', fontSize: '10px' }}>🛡 DEEP WORK — incoming kicks blocked</span>
            </div>
          )}
        </div>
      )}

      {/* Tab strip — always visible */}
      <div className="streamer-hud__tab" role="toolbar">
        <button
          type="button"
          className="streamer-hud__tab-toggle"
          aria-expanded={!isMinimized}
          aria-controls={sheetId}
          onClick={() => setIsMinimized((prev) => !prev)}
        >
          <span className="streamer-hud__tab-toggle-arrow" style={{ transform: isMinimized ? 'rotate(0deg)' : 'rotate(180deg)' }}>▲</span>
          {isMinimized
            ? isStreaming
              ? `● LIVE ${formatElapsed(elapsed)} · HP ${focusPercent}% · ${playerName.toUpperCase() || 'STREAMER'}`
              : `HUD · HP ${focusPercent}% · XP ${xp}/${xpToNextLevel} · ${playerName.toUpperCase() || 'STREAMER'}`
            : 'MINIMIZE HUD'}
        </button>

        {isStreaming && isGoLiveMinimized && isMinimized && (
          <button type="button" className="btn btn-ghost" style={{ fontSize: '9px', padding: '2px 8px', marginLeft: 4 }} onClick={onExpandGoLive}>
            ▶ STREAM
          </button>
        )}

        {!isMinimized && (
          <>
            <div className="streamer-hud__divider" />
            <span className="streamer-hud__stat streamer-hud__stat--pink" style={{ fontSize: '10px' }}>
              {playerName.toUpperCase() || 'STREAMER'}
            </span>
          </>
        )}

        <span className="streamer-hud__brand">WORK OR JERK</span>
      </div>
    </aside>
  )
}
