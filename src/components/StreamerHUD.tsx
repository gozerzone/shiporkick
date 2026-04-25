import { useId, useState } from 'react'

interface StreamerHUDProps {
  taskOfHour: string
  currentHealth: number
  xp: number
  xpToNextLevel: number
  kickBucks: number
  playerName: string
  shieldActive?: boolean
  glitchActive?: boolean
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value))
}

function hpColor(hp: number): string {
  if (hp > 60) return 'var(--green)'
  if (hp > 30) return 'var(--gold)'
  return 'var(--danger)'
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
}: StreamerHUDProps) {
  const [isMinimized, setIsMinimized] = useState(true)
  const sheetId = useId()
  const focusPercent = clampPercent(currentHealth)
  const xpPercent = clampPercent(xpToNextLevel > 0 ? (xp / xpToNextLevel) * 100 : 0)

  return (
    <aside className="streamer-hud" aria-live="polite">
      {!isMinimized && (
        <div id={sheetId} className="streamer-hud__sheet" role="region" aria-label="Streamer status" aria-hidden={isMinimized}>
          {/* Task row */}
          <div className="streamer-hud__row">
            <div className="live-pulse">
              <div className="live-pulse__dot" />
              <span className="live-pulse__label">LIVE</span>
            </div>
            <span className="streamer-hud__task">{taskOfHour || 'No task set'}</span>
          </div>

          {/* HP meter */}
          <div className={`streamer-hud__row${glitchActive ? ' streamer-hud__meter--glitch' : ''}`}>
            <span className="streamer-hud__stat">HP</span>
            <div className="streamer-hud__meter-wrap">
              <div className="streamer-hud__meter-track">
                <div
                  className="streamer-hud__meter-fill"
                  style={{ width: `${focusPercent}%`, background: hpColor(currentHealth) }}
                />
              </div>
              <span className="streamer-hud__stat" style={{ color: hpColor(currentHealth), minWidth: '32px', textAlign: 'right' }}>
                {focusPercent}%
              </span>
            </div>
            {shieldActive && (
              <span className="streamer-hud__shield-note">🛡 SHIELD</span>
            )}
          </div>

          {/* XP + Kick Bucks */}
          <div className="streamer-hud__row">
            <span className="streamer-hud__stat">XP</span>
            <div className="xp-bar" style={{ flex: 1 }}>
              <div className="xp-bar__track">
                <div className="xp-bar__fill" style={{ width: `${xpPercent}%` }} />
              </div>
              <span className="xp-bar__label">{xp}/{xpToNextLevel}</span>
            </div>
            <div className="streamer-hud__divider" />
            <span className="streamer-hud__stat streamer-hud__stat--gold">⚡ {kickBucks} KB</span>
          </div>

          {glitchActive && (
            <div className="streamer-hud__row">
              <span className="streamer-hud__stat" style={{ color: 'var(--danger)', fontSize: '10px' }}>
                ⚠ PRIORITY GLITCH — teammate spent a kick token
              </span>
            </div>
          )}
          {shieldActive && (
            <div className="streamer-hud__row">
              <span className="streamer-hud__stat" style={{ color: 'var(--gold)', fontSize: '10px' }}>
                🛡 DEEP WORK — incoming kicks blocked
              </span>
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
          <span
            className="streamer-hud__tab-toggle-arrow"
            style={{ transform: isMinimized ? 'rotate(0deg)' : 'rotate(180deg)' }}
          >
            ▲
          </span>
          {isMinimized
            ? `HUD · HP ${focusPercent}% · XP ${xp}/${xpToNextLevel} · ${playerName.toUpperCase() || 'STREAMER'}`
            : 'MINIMIZE HUD'}
        </button>

        {!isMinimized && (
          <>
            <div className="streamer-hud__divider" />
            <span className="streamer-hud__stat streamer-hud__stat--pink" style={{ fontSize: '10px' }}>
              {playerName.toUpperCase() || 'STREAMER'}
            </span>
          </>
        )}

        <span className="streamer-hud__brand">SHIP OR KICK</span>
      </div>
    </aside>
  )
}
