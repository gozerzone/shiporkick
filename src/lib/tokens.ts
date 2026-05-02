import { publicDb } from './publicSupabase'

export async function fetchProfileIdForClerk(clerkUserId: string | null): Promise<string | null> {
  if (!clerkUserId) return null
  const db = publicDb()
  if (!db) return null
  const { data, error } = await db.rpc('resolve_profile_id_for_clerk', { p_clerk_user_id: clerkUserId })
  if (error) return null
  return typeof data === 'string' ? data : null
}

export interface TokenBalances {
  kickTokens: number
  blockKickTokens: number
  vouchPowerTokens: number
}

export async function fetchTokenBalances(clerkUserId: string | null): Promise<TokenBalances | null> {
  const db = publicDb()
  if (!db || !clerkUserId) return null
  const { data, error } = await db.rpc('get_token_balances', { p_clerk_user_id: clerkUserId })
  if (error) throw new Error(error.message)
  const row = Array.isArray(data) ? (data[0] as Record<string, unknown> | undefined) : undefined
  if (!row) return { kickTokens: 0, blockKickTokens: 0, vouchPowerTokens: 0 }
  return {
    kickTokens: Number(row.kick_tokens ?? 0),
    blockKickTokens: Number(row.block_kick_tokens ?? 0),
    vouchPowerTokens: Number(row.vouch_power_tokens ?? 0),
  }
}

export async function spendKickGlitchToken(clerkUserId: string, targetSessionId: string) {
  const db = publicDb()
  if (!db) throw new Error('Supabase not configured')
  const { error } = await db.rpc('spend_kick_glitch', {
    p_actor_clerk_id: clerkUserId,
    p_target_session_id: targetSessionId,
  })
  if (error) throw new Error(error.message)
}

export async function spendVouchPowerToken(clerkUserId: string, targetSessionId: string) {
  const db = publicDb()
  if (!db) throw new Error('Supabase not configured')
  const { error } = await db.rpc('spend_vouch_power', {
    p_actor_clerk_id: clerkUserId,
    p_target_session_id: targetSessionId,
  })
  if (error) throw new Error(error.message)
}

// Supabase Auth-aware spend functions — share a single token pool.
// Both jerk and vouch decrement the same `kick_tokens` column on the server.
export async function spendJerk(targetSessionId: string) {
  const db = publicDb()
  if (!db) throw new Error('Supabase not configured')
  const { error } = await db.rpc('spend_jerk', { p_target_session_id: targetSessionId })
  if (error) throw new Error(error.message)
}

export async function spendVouch(targetSessionId: string) {
  const db = publicDb()
  if (!db) throw new Error('Supabase not configured')
  const { error } = await db.rpc('spend_vouch', { p_target_session_id: targetSessionId })
  if (error) throw new Error(error.message)
}

export async function fetchMyTokenBalance(): Promise<number> {
  const db = publicDb()
  if (!db) return 0
  const { data, error } = await db.rpc('my_token_balance')
  if (error) return 0
  return Number(data ?? 0)
}

export async function updateMyAvatar(emoji: string) {
  const db = publicDb()
  if (!db) throw new Error('Supabase not configured')
  const { error } = await db.rpc('update_my_avatar', { p_emoji: emoji })
  if (error) throw new Error(error.message)
}

export async function activateDeepWorkShield(clerkUserId: string) {
  const db = publicDb()
  if (!db) throw new Error('Supabase not configured')
  const { data, error } = await db.rpc('activate_deep_work_shield', { p_actor_clerk_id: clerkUserId })
  if (error) throw new Error(error.message)
  if (data === null || data === undefined) return null
  return String(data)
}
