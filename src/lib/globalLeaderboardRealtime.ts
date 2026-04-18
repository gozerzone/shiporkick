import { supabase } from './supabaseClient'

export interface LeaderboardStreamer {
  sessionId: string
  username: string
  quest: string
  vouchCount: number
  currentHealth: number
}

type SessionRow = {
  id: string
  task_description: string
  current_health: number
  vouch_count: number
  profiles: { username: string } | { username: string }[] | null
}

export async function fetchActiveStreamers(): Promise<LeaderboardStreamer[]> {
  if (!supabase) {
    return []
  }

  const { data, error } = await supabase
    .from('sessions')
    .select('id, task_description, current_health, vouch_count, profiles!inner(username)')
    .gt('current_health', 0)
    .order('start_time', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data as SessionRow[]).map((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      sessionId: row.id,
      username: profile?.username ?? 'UNKNOWN',
      quest: row.task_description,
      vouchCount: row.vouch_count ?? 0,
      currentHealth: row.current_health,
    }
  })
}

export function subscribeToLeaderboardRefresh(onRefresh: () => void) {
  if (!supabase) {
    return () => {}
  }
  const client = supabase

  const sessionsChannel = client
    .channel('leaderboard:sessions')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, onRefresh)
    .subscribe()

  const profilesChannel = client
    .channel('leaderboard:profiles')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, onRefresh)
    .subscribe()

  return () => {
    void client.removeChannel(sessionsChannel)
    void client.removeChannel(profilesChannel)
  }
}
