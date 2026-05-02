import { useMemo, useState } from 'react'
import { publicDb } from '../lib/publicSupabase'

interface SubmitFoulResult {
  applied: boolean
  current_health: number
  unique_fouls: number
  needed_fouls: number
}

interface FoulButtonProps {
  sessionId: string
}

const VIEWER_ID_STORAGE_KEY = 'shiporkick.viewer-id'

function getStableViewerId() {
  const existing = window.localStorage.getItem(VIEWER_ID_STORAGE_KEY)
  if (existing) return existing

  const generated =
    window.crypto?.randomUUID?.() ?? `viewer-${Date.now()}-${Math.random().toString(36).slice(2)}`
  window.localStorage.setItem(VIEWER_ID_STORAGE_KEY, generated)
  return generated
}

function HeadphonesSVG({ stage, shake }: { stage: number; shake: boolean }) {
  return (
    <svg
      className={`headphones${shake ? ' headphones--shake' : ''}${stage >= 3 ? ' headphones--wasted' : ''}`}
      width="88"
      height="68"
      viewBox="0 0 88 68"
      fill="none"
      aria-label={`Headphone damage stage ${stage} of 3`}
    >
      {/* Headband — bends at stage 2 */}
      {stage < 2 ? (
        <path
          d="M18 38 C18 11 70 11 70 38"
          stroke="var(--border)"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      ) : (
        <path
          d="M18 38 C15 9 46 5 44 16 C42 26 73 9 70 38"
          stroke="var(--danger)"
          strokeWidth="3.5"
          strokeLinecap="round"
          fill="none"
        />
      )}

      {/* Left ear cup */}
      <rect
        x="5"
        y="30"
        width="18"
        height="24"
        rx="6"
        fill="var(--card2)"
        stroke={stage >= 1 ? 'var(--danger)' : 'var(--border)'}
        strokeWidth="2"
      />
      {/* Left speaker grills */}
      <line x1="9" y1="38" x2="19" y2="38" stroke="var(--muted)" strokeWidth="1" opacity="0.4" />
      <line x1="9" y1="42" x2="19" y2="42" stroke="var(--muted)" strokeWidth="1" opacity="0.4" />
      <line x1="9" y1="46" x2="19" y2="46" stroke="var(--muted)" strokeWidth="1" opacity="0.4" />
      {/* Stage 1+ crack on left cup */}
      {stage >= 1 && (
        <path
          d="M11 32 L15 40 L11 48"
          stroke="var(--danger)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* Stage 3: shattered left */}
      {stage >= 3 && (
        <>
          <path d="M7 31 L21 49" stroke="var(--danger)" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M21 31 L7 49" stroke="var(--danger)" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}

      {/* Right ear cup */}
      <rect
        x="65"
        y="30"
        width="18"
        height="24"
        rx="6"
        fill="var(--card2)"
        stroke={stage >= 2 ? 'var(--danger)' : 'var(--border)'}
        strokeWidth="2"
      />
      {/* Right speaker grills */}
      <line x1="69" y1="38" x2="79" y2="38" stroke="var(--muted)" strokeWidth="1" opacity="0.4" />
      <line x1="69" y1="42" x2="79" y2="42" stroke="var(--muted)" strokeWidth="1" opacity="0.4" />
      <line x1="69" y1="46" x2="79" y2="46" stroke="var(--muted)" strokeWidth="1" opacity="0.4" />
      {/* Stage 2+ crack on right cup */}
      {stage >= 2 && (
        <path
          d="M77 32 L73 40 L77 48"
          stroke="var(--danger)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      {/* Stage 3: shattered right */}
      {stage >= 3 && (
        <>
          <path d="M67 31 L81 49" stroke="var(--danger)" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M81 31 L67 49" stroke="var(--danger)" strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}

export function FoulButton({ sessionId }: FoulButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [foulCount, setFoulCount] = useState(0)
  const [neededFouls, setNeededFouls] = useState(3)
  const [shake, setShake] = useState(false)
  const viewerId = useMemo(() => getStableViewerId(), [])

  const damageStage = foulCount >= neededFouls ? 3 : Math.min(2, foulCount)

  const submitFoul = async () => {
    const supabase = publicDb()
    if (!supabase) {
      setMessage('Supabase is not configured.')
      return
    }

    setIsSubmitting(true)
    setMessage(null)

    const { data, error } = await supabase.rpc('submit_foul', {
      p_session_id: sessionId,
      p_viewer_id: viewerId,
    })

    if (error) {
      setMessage(`Foul failed: ${error.message}`)
      setIsSubmitting(false)
      return
    }

    const result = Array.isArray(data) ? (data[0] as SubmitFoulResult | undefined) : undefined
    if (!result) {
      setMessage('Foul response was empty.')
      setIsSubmitting(false)
      return
    }

    setFoulCount(result.unique_fouls)
    setNeededFouls(result.needed_fouls)
    setShake(true)
    window.setTimeout(() => setShake(false), 500)

    if (result.applied) {
      setMessage(`Impact landed. Stream health is now ${result.current_health}.`)
    } else {
      setMessage(
        `Jerk vote recorded. ${result.needed_fouls - result.unique_fouls} more unique voter(s) needed.`,
      )
    }

    setIsSubmitting(false)
  }

  return (
    <div className="stack" style={{ alignItems: 'center', padding: '8px 0' }}>
      <HeadphonesSVG stage={damageStage} shake={shake} />

      {/* Vote progress dots */}
      <div className="kick-dots">
        {Array.from({ length: neededFouls }).map((_, i) => (
          <div key={i} className={`kick-dot${i < foulCount ? ' kick-dot--active' : ''}`} />
        ))}
      </div>

      <button
        type="button"
        className="btn btn-danger"
        style={{ width: '100%', fontSize: '13px', padding: '10px 20px' }}
        disabled={isSubmitting}
        onClick={() => void submitFoul()}
      >
        {isSubmitting ? 'REGISTERING FOUL...' : '⚡ CALL FOUL'}
      </button>

      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', textAlign: 'center' }}>
        3 unique voters jerk the plug · 1 vote per viewer per hour
      </p>

      {message && (
        <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text)', width: '100%', textAlign: 'center' }}>
          {message}
        </div>
      )}
    </div>
  )
}
