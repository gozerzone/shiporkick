import { useId, useState } from 'react'

interface StreamerHUDProps {
  taskOfHour: string
  currentHealth: number
  xp: number
  xpToNextLevel: number
}

function clampPercent(value: number) {
  return Math.min(100, Math.max(0, value))
}

export function StreamerHUD({
  taskOfHour,
  currentHealth,
  xp,
  xpToNextLevel,
}: StreamerHUDProps) {
  const [isMinimized, setIsMinimized] = useState(true)
  const sheetId = useId()
  const focusPercent = clampPercent(currentHealth)
  const xpPercent = clampPercent((xpToNextLevel > 0 ? (xp / xpToNextLevel) * 100 : 0))

  return (
    <aside
      className={`streamer-hud ${isMinimized ? 'streamer-hud--minimized' : ''}`}
      aria-live="polite"
    >
      <div
        id={sheetId}
        className="streamer-hud__sheet"
        role="region"
        aria-label="Streamer status"
        aria-hidden={isMinimized}
      >
        <div className="streamer-hud__header">
          <p className="streamer-hud__kicker">TASK OF THE HOUR</p>
        </div>

        <h2 className="streamer-hud__task">{taskOfHour}</h2>

        <section className="streamer-hud__meter">
          <div className="streamer-hud__meter-head">
            <span>FOCUS METER</span>
            <span>{focusPercent}%</span>
          </div>
          <div className="streamer-hud__track">
            <div className="streamer-hud__fill" style={{ width: `${focusPercent}%` }} />
          </div>
        </section>

        <section className="streamer-hud__xp">
          <div className="streamer-hud__meter-head">
            <span>XP</span>
            <span>
              {xp}/{xpToNextLevel}
            </span>
          </div>
          <div className="streamer-hud__track">
            <div className="streamer-hud__fill streamer-hud__fill--dark" style={{ width: `${xpPercent}%` }} />
          </div>
        </section>
      </div>

      <button
        type="button"
        className="streamer-hud__tab"
        aria-expanded={!isMinimized}
        aria-controls={sheetId}
        onClick={() => setIsMinimized((prev) => !prev)}
      >
        {isMinimized ? (
          <>
            <span className="streamer-hud__tab-cue" aria-hidden>
              ▲
            </span>
            <span className="streamer-hud__tab-label">
              HUD · HP {focusPercent}% · XP {xp}/{xpToNextLevel}
            </span>
            <span className="streamer-hud__tab-action">OPEN</span>
          </>
        ) : (
          <>
            <span className="streamer-hud__tab-cue" aria-hidden>
              ▼
            </span>
            <span className="streamer-hud__tab-label">TASK HUD</span>
            <span className="streamer-hud__tab-action">MINIMIZE</span>
          </>
        )}
      </button>
    </aside>
  )
}
