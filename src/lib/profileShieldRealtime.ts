import { publicDb } from './publicSupabase'
import { getSupabase } from './supabaseClient'

export function subscribeToProfileShield(
  profileId: string,
  onChange: (shieldUntilIso: string | null) => void,
) {
  const root = getSupabase()
  const db = publicDb()
  if (!root || !db) {
    return () => {}
  }

  const channel = root
    .channel(`profile-shield:${profileId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${profileId}`,
      },
      (payload: { new: { shield_until?: string | null } }) => {
        const row = payload.new
        onChange(row.shield_until ?? null)
      },
    )
    .subscribe()

  void db
    .from('profiles')
    .select('shield_until')
    .eq('id', profileId)
    .maybeSingle()
    .then(({ data }) => {
      onChange((data?.shield_until as string | null | undefined) ?? null)
    })

  return () => {
    void root.removeChannel(channel)
  }
}
