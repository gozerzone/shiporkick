import { getSupabase } from './supabaseClient'

/** All app queries use the `public` schema explicitly (avoids search_path surprises). */
export function publicDb() {
  const client = getSupabase()
  if (!client) return null
  return client.schema('public')
}
