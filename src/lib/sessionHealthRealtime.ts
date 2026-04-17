import { supabase } from './supabaseClient'

interface SessionHealthRow {
  id: string
  current_health: number
}

export function subscribeToSessionHealth(
  sessionId: string,
  onHealthChange: (health: number) => void,
) {
  if (!supabase) {
    throw new Error('Supabase client is not configured.')
  }
  const client = supabase

  const channel = client
    .channel(`session-health:${sessionId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`,
      },
      (payload) => {
        const row = payload.new as SessionHealthRow
        onHealthChange(row.current_health)
      },
    )
    .subscribe()

  return () => {
    void client.removeChannel(channel)
  }
}
