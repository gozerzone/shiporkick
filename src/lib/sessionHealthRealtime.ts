import { publicDb } from './publicSupabase'
import { getSupabase } from './supabaseClient'

export interface SessionHudSnapshot {
  currentHealth: number
  glitchUntilIso: string | null
}

function parseRow(row: Record<string, unknown>): SessionHudSnapshot {
  return {
    currentHealth: Number(row.current_health ?? 100),
    glitchUntilIso:
      row.glitch_until === null || row.glitch_until === undefined
        ? null
        : String(row.glitch_until),
  }
}

/** Subscribes to `public.sessions` health + glitch HUD pulse for one session row. */
export function subscribeToSessionHud(sessionId: string, onChange: (snapshot: SessionHudSnapshot) => void) {
  const root = getSupabase()
  const db = publicDb()
  if (!root || !db) {
    throw new Error('Supabase client is not configured.')
  }

  void db
    .from('sessions')
    .select('current_health, glitch_until')
    .eq('id', sessionId)
    .maybeSingle()
    .then(({ data }) => {
      if (data) onChange(parseRow(data as Record<string, unknown>))
    })

  const channel = root
    .channel(`session-hud:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload: { new: Record<string, unknown> }) => {
        onChange(parseRow(payload.new))
      },
    )
    .subscribe()

  return () => {
    void root.removeChannel(channel)
  }
}
