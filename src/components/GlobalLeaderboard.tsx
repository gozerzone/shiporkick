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

export function GlobalLeaderboard({ clerkUserId, myProfileId, onTokenEconomyChanged }: GlobalLeaderboardProps) {
  const supabaseConfigured = useMemo(
    () =>
      Boolean(getPublicEnv('VITE_SUPABASE_URL') && getPublicEnv('VITE_SUPABASE_ANON_KEY')),
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
      const message =
        loadError instanceof Error ? loadError.message : 'Failed to load leaderboard.'
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
      unsubscribe = subscribeToLeaderboardRefresh(() => {
        void load()
      })
    } catch {
      // Ignore realtime setup failures; initial data still renders.
    }

    return () => {
      mounted = false
      if (unsubscribe) unsubscribe()
    }
  }, [load])

  const setBusy = (sessionId: string, busy: boolean) => {
    setRowBusy((prev) => ({ ...prev, [sessionId]: busy }))
  }

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

  return (
    <article className="panel leaderboard">
      <h2 className="panel__title">Global Leaderboard</h2>
      <p className="leaderboard__sub">Live streamers, current quests, and crowd vouches.</p>

      {!supabaseConfigured ? (
        <p className="error">
          Leaderboard offline: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for the production build, or add them
          to <code>/runtime-config.json</code> in the web root, then run SQL migrations in
          Supabase.
        </p>
      ) : null}
      {loading ? <p>Loading active streamers...</p> : null}
      {error ? <p className="error">Leaderboard error: {error}</p> : null}
      <div className="stack">
        <label htmlFor="categoryFilter">Filter by work category</label>
        <select
          id="categoryFilter"
          className="select"
          value={selectedCategory}
          onChange={(event) => setSelectedCategory(event.target.value)}
        >
          <option value="All categories">All categories</option>
          {WORK_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>

      <div className="leaderboard__table-wrap">
        <table className="leaderboard__table">
          <thead>
            <tr>
              <th>Streamer</th>
              <th>Category</th>
              <th>Quest</th>
              <th>XP</th>
              <th>Vouch</th>
              <th>Health</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={7}>No active streamers for this category right now.</td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const xpMod = ((row.profileXp % XP_SEGMENT) + XP_SEGMENT) % XP_SEGMENT
                const isSelf = Boolean(myProfileId && row.profileId && myProfileId === row.profileId)
                const busy = rowBusy[row.sessionId]
                return (
                  <tr key={row.sessionId}>
                    <td>{row.username}</td>
                    <td>{row.workCategory}</td>
                    <td>{row.quest}</td>
                    <td>
                      {xpMod}/{XP_SEGMENT}
                    </td>
                    <td>{row.vouchCount}</td>
                    <td>{row.currentHealth}</td>
                    <td>
                      <div className="leaderboard__actions">
                        <button
                          type="button"
                          className="btn"
                          disabled={!canSpend || isSelf || busy}
                          onClick={() => void onKickGlitch(row)}
                        >
                          KICK
                        </button>
                        <button
                          type="button"
                          className="btn btn--primary"
                          disabled={!canSpend || isSelf || busy}
                          onClick={() => void onVouch(row)}
                        >
                          VOUCH
                        </button>
                      </div>
                      {!canSpend ? <p className="leaderboard__action-hint">Clerk sign-in required.</p> : null}
                      {isSelf ? <p className="leaderboard__action-hint">Your row.</p> : null}
                      {rowNotice[row.sessionId] ? (
                        <p className="leaderboard__action-hint">{rowNotice[row.sessionId]}</p>
                      ) : null}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}
