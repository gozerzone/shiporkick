import { useCallback, useEffect, useState } from 'react'
import { fetchActiveStreamers, subscribeToLeaderboardRefresh, type LeaderboardStreamer } from '../lib/globalLeaderboardRealtime'

const EMOJIS = ['🦊', '🦅', '🐺', '🐉', '🦁', '🐻']
const XP_SEGMENT = 500

function streamerEmoji(username: string) {
  return EMOJIS[username.charCodeAt(0) % EMOJIS.length]
}

function PodiumSlot({ streamer, position }: { streamer: LeaderboardStreamer; position: 1 | 2 | 3 }) {
  const isFirst = position === 1
  const podiumHeights = { 1: 120, 2: 90, 3: 70 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {isFirst && <div style={{ fontSize: 20 }}>👑</div>}
      <div style={{
        width: isFirst ? 64 : 52, height: isFirst ? 64 : 52, borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(240,4,127,0.4), rgba(124,58,237,0.4))',
        border: `2px solid ${isFirst ? 'var(--pink)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: isFirst ? 28 : 22,
        boxShadow: isFirst ? '0 0 20px rgba(240,4,127,0.3)' : 'none',
      }}>
        {streamerEmoji(streamer.username)}
      </div>
      <div style={{
        background: 'var(--card)', border: `1px solid ${isFirst ? 'var(--pink-border)' : 'var(--border)'}`,
        borderRadius: 6, padding: '6px 10px', textAlign: 'center', width: isFirst ? 120 : 96,
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--text)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {streamer.username}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: isFirst ? 'var(--pink)' : 'var(--muted)' }}>
          {streamer.profileXp % XP_SEGMENT} XP
        </div>
      </div>
      <div style={{
        width: isFirst ? 100 : 80, height: podiumHeights[position],
        background: isFirst
          ? 'linear-gradient(180deg, rgba(240,4,127,0.2), rgba(240,4,127,0.05))'
          : 'linear-gradient(180deg, var(--card2), var(--card))',
        border: `1px solid ${isFirst ? 'var(--pink-border)' : 'var(--border)'}`,
        borderRadius: '4px 4px 0 0',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 28, fontFamily: 'var(--font-mono)', fontWeight: 900,
        color: isFirst ? 'var(--pink)' : 'var(--muted)',
      }}>
        {position}
      </div>
    </div>
  )
}

interface LeaderboardViewProps {
  clerkUserId: string | null
  myProfileId: string | null
}

export function LeaderboardView({ myProfileId }: LeaderboardViewProps) {
  const [rows, setRows] = useState<LeaderboardStreamer[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setRows(await fetchActiveStreamers())
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    let unsub: (() => void) | null = null
    try { unsub = subscribeToLeaderboardRefresh(() => { void load() }) } catch { /* ignore */ }
    return () => { if (unsub) unsub() }
  }, [load])

  const sorted = [...rows].sort((a, b) => b.profileXp - a.profileXp)
  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  const podiumOrder: [LeaderboardStreamer | undefined, LeaderboardStreamer | undefined, LeaderboardStreamer | undefined] = [top3[1], top3[0], top3[2]]
  const positions: (1 | 2 | 3)[] = [2, 1, 3]

  return (
    <div>
      <h1 className="arena-title" style={{ marginBottom: 6 }}>Global Leaderboard</h1>
      <p className="arena-subtitle" style={{ marginBottom: 28 }}>Ranked by XP · Resets never</p>

      {loading && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Loading...</p>
      )}
      {!loading && rows.length === 0 && (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
          No active streamers right now. Be the first — click GO LIVE.
        </p>
      )}

      {top3.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
          {podiumOrder.map((s, i) =>
            s ? <PodiumSlot key={s.sessionId} streamer={s} position={positions[i]} /> : null,
          )}
        </div>
      )}

      <div className="stack">
        {rest.map((row, i) => {
          const isSelf = Boolean(myProfileId && row.profileId === myProfileId)
          return (
            <div key={row.sessionId} className={`leaderboard-row${isSelf ? ' leaderboard-row--self' : ''}`} style={{ animationDelay: `${i * 40}ms` }}>
              <div className="leaderboard-rank">#{i + 4}</div>
              <div className={`leaderboard-avatar${isSelf ? ' leaderboard-avatar--self' : ''}`}>
                {streamerEmoji(row.username)}
              </div>
              <div className="leaderboard-info">
                <div className="leaderboard-name">
                  {row.username}
                  {isSelf && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'var(--pink-dim)', border: '1px solid var(--pink-border)', color: 'var(--pink)', borderRadius: 4, padding: '1px 5px' }}>YOU</span>}
                </div>
                <div className="leaderboard-task">{row.quest}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gold)', flexShrink: 0 }}>
                {(row.profileXp % XP_SEGMENT)}/{XP_SEGMENT} XP
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
