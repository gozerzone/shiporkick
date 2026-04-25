import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchActiveStreamers,
  subscribeToLeaderboardRefresh,
  type LeaderboardStreamer,
} from '../lib/globalLeaderboardRealtime'
import { getPublicEnv } from '../lib/runtimeEnv'
import { spendKickGlitchToken, spendVouchPowerToken } from '../lib/tokens'
import { WORK_CATEGORIES } from '../lib/workCategories'

const XP_SEGMENT = 500

interface GlobalLeaderboardProps {
  clerkUserId: string | null
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

export function GlobalLeaderboard({ clerkUserId, myProfileId, onTokenEconomyChanged }: GlobalLeaderboardProps) {
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
    if (!clerkUserId) return
    setRowNotice((n) => ({ ...n, [row.sessionId]: null }))
    setBusy(row.sessionId, true)
    try {
      await spendKickGlitchToken(clerkUserId, row.sessionId)
      setRowNotice((n) => ({ ...n, [row.sessionId]: 'Glitch sent.' }))
      onTokenEconomyChanged?.()
      await load()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Kick token failed.'
      setRowNotice((n) => ({ ...n, [row.sessionId]: msg }))
    } finally {
      setBusy(row.sessionId, false)
    }
  }

  const onVouch = async (row: LeaderboardStreamer) => {
    if (!clerkUserId) return
    setRowNotice((n) => ({ ...n, [row.sessionId]: null }))
    setBusy(row.sessionId, true)
    try {
      await spendVouchPowerToken(clerkUserId, row.sessionId)
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

  const canSpend = Boolean(clerkUserId)
  const categories = ['All categories', ...WORK_CATEGORIES]

  return (
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
                {rowEmoji(row.username)}
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
                </div>
              </div>

              <div className="leaderboard-actions">
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={!canSpend || isSelf || busy}
                    onClick={() => void onKickGlitch(row)}
                  >
                    ⚡ KICK
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
  )
}
