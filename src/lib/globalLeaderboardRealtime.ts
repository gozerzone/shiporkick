import { publicDb } from './publicSupabase'
import { getSupabase } from './supabaseClient'

export interface LeaderboardStreamer {
  sessionId: string
  profileId: string
  username: string
  quest: string
  workCategory: string
  vouchCount: number
  currentHealth: number
  profileXp: number
}

type SessionRow = {
  id: string
  task_description: string
  work_category: string | null
  current_health: number
  vouch_count: number
  profiles: { username: string; xp: number | null; id: string } | { username: string; xp: number | null; id: string }[] | null
}

export async function fetchActiveStreamers(): Promise<LeaderboardStreamer[]> {
  const db = publicDb()
  if (!db) {
    return []
  }

  const { data, error } = await db
    .from('sessions')
    .select(
      'id, task_description, work_category, current_health, vouch_count, profiles!inner(username, xp, id)',
    )
    .eq('is_active', true)
    .gt('current_health', 0)
    .order('start_time', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data as SessionRow[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      sessionId: row.id,
      profileId: profile?.id ?? '',
      username: profile?.username ?? 'UNKNOWN',
      quest: row.task_description,
      workCategory: row.work_category ?? 'General / Other',
      vouchCount: row.vouch_count ?? 0,
      currentHealth: row.current_health,
      profileXp: profile?.xp ?? 0,
    }
  })
}

export function subscribeToLeaderboardRefresh(onRefresh: () => void) {
  const root = getSupabase()
  if (!root) {
    return () => {}
  }

  const sessionsChannel = root
    .channel('leaderboard:sessions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, onRefresh)
    .subscribe()

  const profilesChannel = root
    .channel('leaderboard:profiles')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, onRefresh)
    .subscribe()

  return () => {
    void root.removeChannel(sessionsChannel)
    void root.removeChannel(profilesChannel)
  }
}
