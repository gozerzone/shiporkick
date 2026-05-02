import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchActiveStreamers,
  subscribeToLeaderboardRefresh,
  type LeaderboardStreamer,
} from '../lib/globalLeaderboardRealtime'
import { getPublicEnv } from '../lib/runtimeEnv'
import { spendJerk, spendVouch } from '../lib/tokens'
import { WORK_CATEGORIES } from '../lib/workCategories'
import { LiveThumbnail } from './LiveThumbnail'
import { WatchModal } from './WatchModal'

const XP_SEGMENT = 500

function hpToKicks(hp: number): 0 | 1 | 2 | 3 {
  if (hp <= 0) return 3
  if (hp <= 60) return 2
  if (hp <= 80) return 1
  return 0
}

function RowHeadphones({ hp }: { hp: number }) {
  const kicks = hpToKicks(hp)
  const TEXT = 'var(--text)'
  const MUTED = 'var(--muted)'
  const DANGER = 'var(--danger)'

  if (kicks === 0) return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="No damage">
      <path d="M6 18v-4a10 10 0 0 1 20 0v4" stroke={TEXT} strokeWidth="2" strokeLinecap="round" fill="none"/>
      <rect x="3" y="16" width="5" height="8" rx="2" fill={TEXT}/>
      <rect x="24" y="16" width="5" height="8" rx="2" fill={TEXT}/>
    </svg>
  )
  if (kicks === 1) return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="1 jerk vote">
      <path d="M6 18v-4a10 10 0 0 1 20 0v4" stroke={MUTED} strokeWidth="2" strokeLinecap="round" fill="none" strokeDasharray="3 2"/>
      <rect x="3" y="16" width="5" height="8" rx="2" fill={MUTED} opacity="0.3"/>
      <line x1="3" y1="16" x2="8" y2="24" stroke={DANGER} strokeWidth="1.5"/>
      <line x1="8" y1="16" x2="3" y2="24" stroke={DANGER} strokeWidth="1.5"/>
      <rect x="24" y="16" width="5" height="8" rx="2" fill={TEXT}/>
    </svg>
  )
  if (kicks === 2) return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="2 jerk votes">
      <path d="M6 18v-4a10 10 0 0 1 20 0v4" stroke={DANGER} strokeWidth="2" strokeLinecap="round" fill="none" strokeDasharray="2 3"/>
      <rect x="3" y="16" width="5" height="8" rx="2" fill={DANGER} opacity="0.3"/>
      <line x1="3" y1="16" x2="8" y2="24" stroke={DANGER} strokeWidth="1.5"/>
      <line x1="8" y1="16" x2="3" y2="24" stroke={DANGER} strokeWidth="1.5"/>
      <rect x="24" y="16" width="5" height="8" rx="2" fill={DANGER} opacity="0.3"/>
      <line x1="24" y1="16" x2="29" y2="24" stroke={DANGER} strokeWidth="1.5"/>
      <line x1="29" y1="16" x2="24" y2="24" stroke={DANGER} strokeWidth="1.5"/>
    </svg>
  )
  // 3rd state: cable + 3.5mm plug yanked clean out of the headphones.
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-label="Jerked — plug pulled">
      {/* Faded headphones, intact but disconnected */}
      <path d="M5 14v-2a8 8 0 0 1 16 0v2" stroke={DANGER} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.35"/>
      <rect x="3" y="13" width="4" height="7" rx="1.5" fill={DANGER} opacity="0.25"/>
      <rect x="19" y="13" width="4" height="7" rx="1.5" fill={DANGER} opacity="0.25"/>
      {/* Yanked cable curving outward */}
      <path d="M22.5 19 Q 27 22 26.5 27" stroke={DANGER} strokeWidth="1.7" fill="none" strokeLinecap="round"/>
      {/* 3.5mm TRS plug at the end of the cable */}
      <rect x="24.4" y="26.5" width="4.2" height="3.6" rx="0.6" fill={DANGER}/>
      <line x1="25.3" y1="27.5" x2="25.3" y2="29.6" stroke="rgba(0,0,0,0.55)" strokeWidth="0.5"/>
      <line x1="26.5" y1="27.5" x2="26.5" y2="29.6" stroke="rgba(0,0,0,0.55)" strokeWidth="0.5"/>
      <line x1="27.7" y1="27.5" x2="27.7" y2="29.6" stroke="rgba(0,0,0,0.55)" strokeWidth="0.5"/>
      {/* Motion lines showing the yank */}
      <line x1="20" y1="22" x2="22" y2="20.5" stroke={DANGER} strokeWidth="1" opacity="0.45"/>
      <line x1="22" y1="24" x2="24" y2="22.5" stroke={DANGER} strokeWidth="1" opacity="0.45"/>
    </svg>
  )
}

interface GlobalLeaderboardProps {
  clerkUserId: string | null
  authUserId?: string | null
  myProfileId: string | null
  onTokenEconomyChanged?: () => void
}

function hpColor(hp: number): string {
  if (hp > 60) return 'var(--green)'
  if (hp > 30) return 'var(--gold)'
  return 'var(--danger)'
}

function rowEmoji(username: string): string {
  const pool = ['🔥', '⚡', '🚀', '💻', '🎯', '🌊', '🎮', '🦾']
  return pool[username.charCodeAt(0) % pool.length]
}

export function GlobalLeaderboard({ clerkUserId, authUserId, myProfileId, onTokenEconomyChanged }: GlobalLeaderboardProps) {
  const supabaseConfigured = useMemo(
    () => Boolean(getPublicEnv('VITE_SUPABASE_URL') && getPublicEnv('VITE_SUPABASE_ANON_KEY')),
    [],
  )
  const [rows, setRows] = useState<LeaderboardStreamer[]>([])
  const [selectedCategory, setSelectedCategory] = useState('All categories')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rowNotice, setRowNotice] = useState<Record<string, string | null>>({})
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({})
  const [watchingStreamer, setWatchingStreamer] = useState<LeaderboardStreamer | null>(null)

  const filteredRows = useMemo(() => {
    if (selectedCategory === 'All categories') return rows
    return rows.filter((row) => row.workCategory === selectedCategory)
  }, [rows, selectedCategory])

  const load = useCallback(async () => {
    if (!supabaseConfigured) {
      setRows([])
      setLoading(false)
      return
    }
    try {
      const data = await fetchActiveStreamers()
      setRows(data)
      setError(null)
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to load leaderboard.'
      setRows([])
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [supabaseConfigured])

  useEffect(() => {
    let mounted = true
    const run = async () => {
      setLoading(true)
      await load()
      if (!mounted) return
    }
    void run()

    let unsubscribe: (() => void) | null = null
    try {
      unsubscribe = subscribeToLeaderboardRefresh(() => { void load() })
    } catch {
      // Ignore realtime setup failures; initial data still renders.
    }

    return () => {
      mounted = false
      if (unsubscribe) unsubscribe()
    }
  }, [load])

  const setBusy = (sessionId: string, busy: boolean) =>
    setRowBusy((prev) => ({ ...prev, [sessionId]: busy }))

  const onKickGlitch = async (row: LeaderboardStreamer) => {
    if (!authUserId) return
    setRowNotice((n) => ({ ...n, [row.sessionId]: null }))
    setBusy(row.sessionId, true)
    try {
      await spendJerk(row.sessionId)
      setRowNotice((n) => ({ ...n, [row.sessionId]: 'Jerk sent.' }))
      onTokenEconomyChanged?.()
      await load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Jerk failed.'
      setRowNotice((n) => ({ ...n, [row.sessionId]: msg }))
    } finally {
      setBusy(row.sessionId, false)
    }
  }

  const onVouch = async (row: LeaderboardStreamer) => {
    if (!authUserId) return
    setRowNotice((n) => ({ ...n, [row.sessionId]: null }))
    setBusy(row.sessionId, true)
    try {
      await spendVouch(row.sessionId)
      setRowNotice((n) => ({ ...n, [row.sessionId]: 'Vouch applied.' }))
      onTokenEconomyChanged?.()
      await load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Vouch failed.'
      setRowNotice((n) => ({ ...n, [row.sessionId]: msg }))
    } finally {
      setBusy(row.sessionId, false)
    }
  }

  const canSpend = Boolean(authUserId || clerkUserId)
  const categories = ['All categories', ...WORK_CATEGORIES]

  return (
    <>
    {watchingStreamer && (
      <WatchModal
        streamer={watchingStreamer}
        clerkUserId={clerkUserId}
        myProfileId={myProfileId}
        onClose={() => setWatchingStreamer(null)}
        onTokenEconomyChanged={onTokenEconomyChanged}
      />
    )}
    <article style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
          <div>
            <div className="leaderboard-title">LIVE LEADERBOARD</div>
            <div className="leaderboard-subtitle">Active streamers · Real-time</div>
          </div>
          <div className="live-pulse">
            <div className="live-pulse__dot" />
            <span className="live-pulse__label">LIVE</span>
          </div>
        </div>

        {!supabaseConfigured && (
          <div style={{ marginTop: '8px', background: 'var(--danger-dim)', border: '1px solid rgba(255,59,59,0.3)', borderRadius: 'var(--radius)', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--danger)' }}>
            Leaderboard offline — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
          </div>
        )}
        {error && (
          <div style={{ marginTop: '8px', background: 'var(--danger-dim)', border: '1px solid rgba(255,59,59,0.3)', borderRadius: 'var(--radius)', padding: '8px 12px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--danger)' }}>
            {error}
          </div>
        )}
      </div>

      {/* Category filter chips */}
      <div className="category-filter">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            className={`category-chip${selectedCategory === cat ? ' category-chip--active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat === 'All categories' ? 'ALL' : cat.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Rows */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {loading && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', padding: '16px 2px' }}>
            Loading streamers...
          </div>
        )}
        {!loading && filteredRows.length === 0 && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', padding: '16px 2px' }}>
            No active streamers in this category.
          </div>
        )}

        {filteredRows.map((row, idx) => {
          const isSelf = Boolean(myProfileId && row.profileId && myProfileId === row.profileId)
          const busy = rowBusy[row.sessionId]
          const xpMod = ((row.profileXp % XP_SEGMENT) + XP_SEGMENT) % XP_SEGMENT
          const isTop = idx < 3

          return (
            <div
              key={row.sessionId}
              className={`leaderboard-row${isSelf ? ' leaderboard-row--self' : ''}${row.currentHealth === 0 ? ' leaderboard-row--wasted' : ''}`}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              <div className={`leaderboard-rank${isTop ? ' leaderboard-rank--top' : ''}`}>
                {isTop ? (['🥇', '🥈', '🥉'] as const)[idx] : `#${idx + 1}`}
              </div>

              <div className={`leaderboard-avatar${isSelf ? ' leaderboard-avatar--self' : ''}`}>
                {row.avatarEmoji || rowEmoji(row.username)}
              </div>

              <div className="leaderboard-info">
                <div className="leaderboard-name">
                  {row.username}
                  {isSelf && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', background: 'var(--pink-dim)', border: '1px solid var(--pink-border)', color: 'var(--pink)', borderRadius: '4px', padding: '1px 5px', letterSpacing: '0.5px' }}>
                      YOU
                    </span>
                  )}
                </div>
                <div className="leaderboard-task">{row.quest}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <div className="hp-bar" style={{ flex: '1 1 80px', minWidth: '60px' }}>
                    <span className="hp-bar__label">HP</span>
                    <div className="hp-bar__track">
                      <div className="hp-bar__fill" style={{ width: `${row.currentHealth}%`, background: hpColor(row.currentHealth) }} />
                    </div>
                    <span className="hp-bar__value" style={{ color: hpColor(row.currentHealth) }}>{row.currentHealth}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--gold)', flexShrink: 0 }}>
                    ▲{row.vouchCount}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', flexShrink: 0 }}>
                    {xpMod}/{XP_SEGMENT} XP
                  </span>
                  {row.streakDays > 0 && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--danger)', flexShrink: 0, fontWeight: 700 }}>
                      🔥 {row.streakDays}d
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <LiveThumbnail streamer={row} compact onClick={() => setWatchingStreamer(row)} />
                <RowHeadphones hp={row.currentHealth} />
              </div>

              <div className="leaderboard-actions">
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={!canSpend || isSelf || busy}
                    onClick={() => void onKickGlitch(row)}
                  >
                    🔌 JERK
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!canSpend || isSelf || busy}
                    onClick={() => void onVouch(row)}
                  >
                    ▲ VOUCH
                  </button>
                </div>
                {!canSpend && <div className="leaderboard-notice">Sign in to act</div>}
                {isSelf && <div className="leaderboard-notice">Your row</div>}
                {rowNotice[row.sessionId] && (
                  <div className="leaderboard-notice">{rowNotice[row.sessionId]}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </article>
    </>
  )
}
