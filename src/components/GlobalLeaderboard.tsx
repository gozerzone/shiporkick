import { useEffect, useState } from 'react'
import {
  fetchActiveStreamers,
  subscribeToLeaderboardRefresh,
  type LeaderboardStreamer,
} from '../lib/globalLeaderboardRealtime'

export function GlobalLeaderboard() {
  const [rows, setRows] = useState<LeaderboardStreamer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      try {
        const data = await fetchActiveStreamers()
        if (!mounted) return
        setRows(data)
        setError(null)
      } catch (loadError) {
        if (!mounted) return
        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load leaderboard.'
        setError(message)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    void load()

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
  }, [])

  return (
    <article className="panel leaderboard">
      <h2 className="panel__title">Global Leaderboard</h2>
      <p className="leaderboard__sub">Live streamers, current quests, and crowd vouches.</p>

      {loading ? <p>Loading active streamers...</p> : null}
      {error ? <p className="error">Leaderboard error: {error}</p> : null}

      <div className="leaderboard__table-wrap">
        <table className="leaderboard__table">
          <thead>
            <tr>
              <th>Streamer</th>
              <th>Quest</th>
              <th>Vouch</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>No active streamers right now.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.sessionId}>
                  <td>{row.username}</td>
                  <td>{row.quest}</td>
                  <td>{row.vouchCount}</td>
                  <td>{row.currentHealth}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}
