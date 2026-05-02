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
  livekitRoom: string | null
  streakDays: number
  avatarEmoji: string | null
  isActive: boolean
  startTime: string
  endedAt: string | null
}

type SessionRow = {
  id: string
  task_description: string
  work_category: string | null
  current_health: number
  vouch_count: number
  livekit_room: string | null
  is_active: boolean
  start_time: string
  ended_at: string | null
  profiles:
    | { username: string; xp: number | null; id: string; streak_days: number | null; avatar_emoji: string | null }
    | { username: string; xp: number | null; id: string; streak_days: number | null; avatar_emoji: string | null }[]
    | null
}

const SELECT_COLUMNS =
  'id, task_description, work_category, current_health, vouch_count, livekit_room, is_active, start_time, ended_at, profiles!inner(username, xp, id, streak_days, avatar_emoji)'

function rowToStreamer(row: SessionRow): LeaderboardStreamer {
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
    livekitRoom: row.livekit_room,
    streakDays: profile?.streak_days ?? 0,
    avatarEmoji: profile?.avatar_emoji ?? null,
    isActive: Boolean(row.is_active),
    startTime: row.start_time,
    endedAt: row.ended_at,
  }
}

export async function fetchActiveStreamers(): Promise<LeaderboardStreamer[]> {
  const db = publicDb()
  if (!db) return []

  const { data, error } = await db
    .from('sessions')
    .select(SELECT_COLUMNS)
    .eq('is_active', true)
    .gt('current_health', 0)
    .order('start_time', { ascending: false })

  if (error) throw new Error(error.message)
  return (data as SessionRow[]).map(rowToStreamer)
}

export async function fetchLeaderboardStreamers(): Promise<LeaderboardStreamer[]> {
  const db = publicDb()
  if (!db) return []

  const { data, error } = await db
    .from('sessions')
    .select(SELECT_COLUMNS)
    .order('start_time', { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)

  const seen = new Set<string>()
  const rows: LeaderboardStreamer[] = []
  for (const raw of data as SessionRow[]) {
    const streamer = rowToStreamer(raw)
    if (!streamer.profileId || seen.has(streamer.profileId)) continue
    seen.add(streamer.profileId)
    rows.push(streamer)
  }

  rows.sort((a, b) => {
    const aLive = a.isActive && a.currentHealth > 0
    const bLive = b.isActive && b.currentHealth > 0
    if (aLive !== bLive) return aLive ? -1 : 1
    return new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  })

  return rows
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
