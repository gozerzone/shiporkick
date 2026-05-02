import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchLeaderboardStreamers, subscribeToLeaderboardRefresh, type LeaderboardStreamer } from '../lib/globalLeaderboardRealtime'
import { LiveThumbnail } from './LiveThumbnail'
import { WatchModal } from './WatchModal'

const EMOJIS = ['🦊', '🦅', '🐺', '🐉', '🦁', '🐻']
const XP_SEGMENT = 500

function streamerEmoji(username: string) {
  return EMOJIS[username.charCodeAt(0) % EMOJIS.length]
}

function isLive(s: LeaderboardStreamer) {
  return s.isActive && s.currentHealth > 0
}

function survivalSeconds(s: LeaderboardStreamer, nowMs: number) {
  const start = new Date(s.startTime).getTime()
  if (Number.isNaN(start)) return 0
  const end = isLive(s) ? nowMs : (s.endedAt ? new Date(s.endedAt).getTime() : nowMs)
  return Math.max(0, Math.floor((end - start) / 1000))
}

function formatSurvival(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${sec}s`
  return `${sec}s`
}

function PodiumSlot({ streamer, position, onClick, nowMs }: { streamer: LeaderboardStreamer; position: 1 | 2 | 3; onClick: () => void; nowMs: number }) {
  const isFirst = position === 1
  const podiumHeights = { 1: 120, 2: 90, 3: 70 }
  const live = isLive(streamer)
  return (
    <button type="button" onClick={onClick} style={{ background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {isFirst && <div style={{ fontSize: 20 }}>👑</div>}
      <div style={{
        width: isFirst ? 64 : 52, height: isFirst ? 64 : 52, borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(240,4,127,0.4), rgba(124,58,237,0.4))',
        border: `2px solid ${isFirst ? 'var(--pink)' : 'var(--border)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: isFirst ? 28 : 22,
        boxShadow: isFirst ? '0 0 20px rgba(240,4,127,0.3)' : 'none',
        opacity: live ? 1 : 0.55,
        filter: live ? 'none' : 'grayscale(0.4)',
      }}>
        {streamer.avatarEmoji || streamerEmoji(streamer.username)}
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
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: live ? 'var(--green)' : 'var(--muted)', marginTop: 2, letterSpacing: 0.5 }}>
          {live ? `LIVE ${formatSurvival(survivalSeconds(streamer, nowMs))}` : `↻ ${formatSurvival(survivalSeconds(streamer, nowMs))}`}
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
    </button>
  )
}

interface LeaderboardViewProps {
  clerkUserId: string | null
  authUserId?: string | null
  myProfileId: string | null
  onTokenEconomyChanged?: () => void
  onPopOutWithLeaderboard?: (s: LeaderboardStreamer) => void
}

export function LeaderboardView({ clerkUserId, authUserId, myProfileId, onTokenEconomyChanged, onPopOutWithLeaderboard }: LeaderboardViewProps) {
  const [rows, setRows] = useState<LeaderboardStreamer[]>([])
  const [loading, setLoading] = useState(true)
  const [watchingStreamer, setWatchingStreamer] = useState<LeaderboardStreamer | null>(null)
  const [nowMs, setNowMs] = useState(() => Date.now())

  const load = useCallback(async () => {
    try {
      setRows(await fetchLeaderboardStreamers())
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

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const sorted = useMemo(() => [...rows].sort((a, b) => b.profileXp - a.profileXp), [rows])
  const topLive = useMemo(() => sorted.find(isLive) ?? null, [sorted])
  const top3 = sorted.slice(0, 3)
  const rest = sorted.slice(3)
  const podiumOrder: [LeaderboardStreamer | undefined, LeaderboardStreamer | undefined, LeaderboardStreamer | undefined] = [top3[1], top3[0], top3[2]]
  const positions: (1 | 2 | 3)[] = [2, 1, 3]

  return (
    <>
      {watchingStreamer && (
        <WatchModal
          streamer={watchingStreamer}
          clerkUserId={clerkUserId}
          authUserId={authUserId}
          myProfileId={myProfileId}
          onClose={() => setWatchingStreamer(null)}
          onTokenEconomyChanged={onTokenEconomyChanged}
          onPopOutWithLeaderboard={onPopOutWithLeaderboard ? () => { onPopOutWithLeaderboard(watchingStreamer); setWatchingStreamer(null) } : undefined}
        />
      )}
      <div>
        <h1 className="arena-title" style={{ marginBottom: 6 }}>Global Leaderboard</h1>
        <p className="arena-subtitle" style={{ marginBottom: 24 }}>Ranked by XP · Past runs show survival time</p>

        {loading && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>Loading...</p>
        )}
        {!loading && rows.length === 0 && (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
            No streamers yet. Be the first — click GO LIVE.
          </p>
        )}

        {/* Featured: live preview of top-XP streamer who is currently live */}
        {topLive && (
          <div style={{ marginBottom: 24, background: 'var(--card)', border: '1px solid var(--pink-border)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--pink)', boxShadow: '0 0 6px var(--pink)', animation: 'pulse-dot 1.5s ease-in-out infinite' }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: 'var(--pink)', textTransform: 'uppercase' }}>Streaming Now</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', fontWeight: 700 }}>
                {topLive.username} · {formatSurvival(survivalSeconds(topLive, nowMs))}
              </span>
            </div>
            <LiveThumbnail streamer={topLive} onClick={() => setWatchingStreamer(topLive)} />
            <div style={{ padding: '10px 14px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
              {topLive.quest}
            </div>
          </div>
        )}

        {top3.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12, marginBottom: 32 }}>
            {podiumOrder.map((s, i) =>
              s ? <PodiumSlot key={s.sessionId} streamer={s} position={positions[i]} onClick={() => setWatchingStreamer(s)} nowMs={nowMs} /> : null,
            )}
          </div>
        )}

        <div className="stack">
          {rest.map((row, i) => {
            const isSelf = Boolean(myProfileId && row.profileId === myProfileId)
            const live = isLive(row)
            const kicked = !live && row.currentHealth === 0
            const survived = formatSurvival(survivalSeconds(row, nowMs))
            return (
              <div
                key={row.sessionId}
                className={`leaderboard-row${isSelf ? ' leaderboard-row--self' : ''}${live ? '' : ' leaderboard-row--wasted'}`}
                style={{ animationDelay: `${i * 40}ms`, opacity: live ? 1 : 0.78 }}
              >
                <div className="leaderboard-rank">#{i + 4}</div>
                <div
                  className={`leaderboard-avatar${isSelf ? ' leaderboard-avatar--self' : ''}`}
                  style={{ filter: live ? 'none' : 'grayscale(0.5)' }}
                >
                  {row.avatarEmoji || streamerEmoji(row.username)}
                </div>
                <div className="leaderboard-info">
                  <div className="leaderboard-name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {row.username}
                    {isSelf && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'var(--pink-dim)', border: '1px solid var(--pink-border)', color: 'var(--pink)', borderRadius: 4, padding: '1px 5px' }}>YOU</span>}
                    {live && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: 'var(--green)', borderRadius: 4, padding: '1px 5px', letterSpacing: 0.5 }}>
                        ● LIVE
                      </span>
                    )}
                    {!live && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'rgba(120,120,120,0.15)', border: '1px solid var(--border)', color: 'var(--muted)', borderRadius: 4, padding: '1px 5px', letterSpacing: 0.5 }}>
                        {kicked ? 'KICKED' : 'ENDED'}
                      </span>
                    )}
                  </div>
                  <div className="leaderboard-task">{row.quest}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: live ? 'var(--green)' : 'var(--muted)', marginTop: 2 }}>
                    {live ? `Streaming for ${survived}` : `Survived ${survived}`}
                  </div>
                </div>
                {live && <LiveThumbnail streamer={row} compact onClick={() => setWatchingStreamer(row)} />}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--gold)', flexShrink: 0 }}>
                  {(row.profileXp % XP_SEGMENT)}/{XP_SEGMENT} XP
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
