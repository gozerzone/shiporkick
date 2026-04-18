import { useEffect, useMemo, useState } from 'react'
import { getSupabase } from '../lib/supabaseClient'

interface BountyProps {
  sessionId: string
}

interface TipResponse {
  bounty_pool: number
  can_cash_out: boolean
  minutes_remaining: number
}

interface SessionSnapshot {
  bounty_pool: number
  start_time: string
  current_health: number
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

function formatUsd(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

export function Bounty({ sessionId }: BountyProps) {
  const [poolCents, setPoolCents] = useState(0)
  const [minutesRemaining, setMinutesRemaining] = useState(90)
  const [canCashOut, setCanCashOut] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const viewerId = useMemo(() => getStableViewerId(), [])

  useEffect(() => {
    const client = getSupabase()
    if (!client) return

    const load = async () => {
      const { data, error } = await client
        .from('sessions')
        .select('bounty_pool, start_time, current_health')
        .eq('id', sessionId)
        .single()

      if (error || !data) return
      const row = data as SessionSnapshot
      setPoolCents(row.bounty_pool ?? 0)
      const elapsedMinutes = Math.floor(
        (Date.now() - new Date(row.start_time).getTime()) / 60000,
      )
      setMinutesRemaining(Math.max(0, 90 - elapsedMinutes))
      setCanCashOut(row.current_health > 0 && elapsedMinutes >= 90)
    }

    void load()

    const channel = client
      .channel(`bounty-session:${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      void client.removeChannel(channel)
    }
  }, [sessionId])

  const onTip = async () => {
    const client = getSupabase()
    if (!client) {
      setMessage('Supabase is not configured.')
      return
    }
    setIsSubmitting(true)
    setMessage(null)

    const { data, error } = await client.rpc('tip_bounty', {
      p_session_id: sessionId,
      p_viewer_id: viewerId,
    })

    if (error) {
      setMessage(`Tip failed: ${error.message}`)
      setIsSubmitting(false)
      return
    }

    const payload = Array.isArray(data) ? (data[0] as TipResponse | undefined) : undefined
    if (!payload) {
      setMessage('No bounty response returned.')
      setIsSubmitting(false)
      return
    }

    setPoolCents(payload.bounty_pool)
    setMinutesRemaining(payload.minutes_remaining)
    setCanCashOut(payload.can_cash_out)
    setMessage(
      payload.can_cash_out
        ? `Bounty increased. Streamer survived and can cash out ${formatUsd(payload.bounty_pool)}.`
        : `Tip landed. ${payload.minutes_remaining} minute(s) left to survive and keep the bounty.`,
    )
    setIsSubmitting(false)
  }

  return (
    <section className="panel bounty">
      <h3 className="panel__title">Bounty Pool</h3>
      <p className="bounty__amount">{formatUsd(poolCents)}</p>
      <p>Tip $1 to raise the stakes. Streamer keeps it only after 90 minutes without a kick.</p>
      <p>Survival timer: {minutesRemaining} minute(s) remaining</p>
      <p>Status: {canCashOut ? 'CASH-OUT ELIGIBLE' : 'IN ARENA'}</p>
      <button className="btn btn--primary" type="button" disabled={isSubmitting} onClick={() => void onTip()}>
        {isSubmitting ? 'PROCESSING $1 TIP...' : 'VOUCH +$1 BOUNTY'}
      </button>
      {message ? <p>{message}</p> : null}
    </section>
  )
}
