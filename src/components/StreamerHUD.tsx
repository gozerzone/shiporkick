import { useState } from 'react'

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
  const [isMinimized, setIsMinimized] = useState(false)
  const focusPercent = clampPercent(currentHealth)
  const xpPercent = clampPercent((xpToNextLevel > 0 ? (xp / xpToNextLevel) * 100 : 0))

  return (
    <aside className={`streamer-hud ${isMinimized ? 'streamer-hud--minimized' : ''}`} aria-live="polite">
      <div className="streamer-hud__header">
        <p className="streamer-hud__kicker">TASK OF THE HOUR</p>
        <button
          type="button"
          className="streamer-hud__toggle"
          onClick={() => setIsMinimized((prev) => !prev)}
        >
          {isMinimized ? 'EXPAND' : 'MINIMIZE'}
        </button>
      </div>

      {!isMinimized ? (
        <>
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
        </>
      ) : (
        <p className="streamer-hud__mini-status">
          HP {focusPercent}% | XP {xp}/{xpToNextLevel}
        </p>
      )}
    </aside>
  )
}
