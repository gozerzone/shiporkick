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

export function FoulButton({ sessionId }: FoulButtonProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const viewerId = useMemo(() => getStableViewerId(), [])

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

    if (result.applied) {
      setMessage(`Impact landed. Stream health is now ${result.current_health}.`)
    } else {
      setMessage(
        `Kick vote recorded. ${result.needed_fouls} more unique voters needed.`,
      )
    }

    setIsSubmitting(false)
  }

  return (
    <div className="stack">
      <button
        type="button"
        className="btn btn--primary"
        disabled={isSubmitting}
        onClick={() => void submitFoul()}
      >
        {isSubmitting ? 'REPORTING FOUL...' : 'FOUL'}
      </button>
      <p>Kick rules: 3 unique voters trigger a hit. Each viewer gets 1 kick vote per hour.</p>
      {message ? <p>{message}</p> : null}
    </div>
  )
}
