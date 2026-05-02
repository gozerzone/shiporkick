import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteVideoTrack,
} from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchActiveStreamers, subscribeToLeaderboardRefresh, type LeaderboardStreamer } from '../lib/globalLeaderboardRealtime'
import { fetchViewerToken } from '../lib/livekitViewerToken'
import { getPublicEnv } from '../lib/runtimeEnv'
import { coerceLiveKitServerUrl } from '../lib/secureUrls'

interface PipMiniPlayerProps {
  streamer: LeaderboardStreamer
  onClose: () => void
}

interface DocPipApi {
  requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>
  window?: Window | null
}

function getDocPipApi(): DocPipApi | undefined {
  return (window as unknown as { documentPictureInPicture?: DocPipApi }).documentPictureInPicture
}

export function isDocumentPipSupported(): boolean {
  return typeof window !== 'undefined' && Boolean(getDocPipApi())
}

function copyStylesIntoPipDoc(target: Document) {
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = Array.from(sheet.cssRules ?? []).map((r) => r.cssText).join('\n')
      const style = target.createElement('style')
      style.textContent = rules
      target.head.appendChild(style)
    } catch {
      // Cross-origin stylesheet — fall back to <link>
      if (sheet.href) {
        const link = target.createElement('link')
        link.rel = 'stylesheet'
        link.href = sheet.href
        target.head.appendChild(link)
      }
    }
  }
}

export function PipMiniPlayer({ streamer, onClose }: PipMiniPlayerProps) {
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const [rows, setRows] = useState<LeaderboardStreamer[]>([])
  const [hasVideo, setHasVideo] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const attachedRef = useRef<RemoteVideoTrack | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  // 1) Open the Document PiP window
  useEffect(() => {
    const api = getDocPipApi()
    if (!api) { onCloseRef.current(); return }
    let win: Window | null = null
    let unmounted = false

    void (async () => {
      try {
        win = await api.requestWindow({ width: 380, height: 560 })
        if (unmounted) { win.close(); return }

        copyStylesIntoPipDoc(win.document)

        win.document.title = `${streamer.username} — Work or Jerk`
        win.document.body.style.margin = '0'
        win.document.body.style.background = '#0F1117'
        win.document.body.style.color = '#F0F0F0'
        win.document.body.style.fontFamily = "'DM Sans', sans-serif"
        win.document.body.style.height = '100vh'
        win.document.body.style.overflow = 'hidden'

        win.addEventListener('pagehide', () => { onCloseRef.current() })
        setPipWindow(win)
      } catch {
        onCloseRef.current()
      }
    })()

    return () => {
      unmounted = true
      if (win) try { win.close() } catch { /* ignore */ }
    }
  }, [streamer.username])

  // 2) Connect to LiveKit and attach the video track
  useEffect(() => {
    const wsUrl = coerceLiveKitServerUrl(getPublicEnv('VITE_LIVEKIT_URL'))
    const room = new Room()
    let cancelled = false

    const sync = () => {
      if (cancelled) return
      const el = videoRef.current
      if (!el) return
      let best: RemoteVideoTrack | null = null
      for (const p of room.remoteParticipants.values()) {
        for (const pub of p.videoTrackPublications.values()) {
          if (!pub.isSubscribed || !pub.track) continue
          const v = pub.track as RemoteVideoTrack
          if (pub.source === Track.Source.ScreenShare) { best = v; break }
          if (!best) best = v
        }
      }
      if (attachedRef.current !== best) {
        if (attachedRef.current) attachedRef.current.detach(el)
        if (best) { best.attach(el); void el.play().catch(() => {}) }
        attachedRef.current = best
      }
      setHasVideo(!!best)
    }

    room.on(RoomEvent.TrackSubscribed, sync)
    room.on(RoomEvent.TrackUnsubscribed, sync)
    room.on(RoomEvent.ParticipantConnected, sync)

    void (async () => {
      try {
        const slug = streamer.username
          ? `stream-${streamer.username.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}`
          : 'stream-anonymous'
        const roomName = streamer.livekitRoom || slug
        const token = await fetchViewerToken(roomName)
        if (cancelled) return
        await room.connect(wsUrl, token, { autoSubscribe: true })
        if (cancelled) { void room.disconnect(); return }
        sync()
      } catch { /* offline */ }
    })()

    return () => {
      cancelled = true
      const el = videoRef.current
      if (attachedRef.current && el) attachedRef.current.detach(el)
      attachedRef.current = null
      if (room.state !== ConnectionState.Disconnected) void room.disconnect()
    }
  }, [streamer.livekitRoom, streamer.username, pipWindow])

  // 3) Leaderboard data + realtime refresh
  useEffect(() => {
    const load = async () => {
      try { setRows(await fetchActiveStreamers()) } catch { /* ignore */ }
    }
    void load()
    let unsub: (() => void) | null = null
    try { unsub = subscribeToLeaderboardRefresh(() => { void load() }) } catch { /* ignore */ }
    return () => { if (unsub) unsub() }
  }, [])

  if (!pipWindow) return null

  const sorted = [...rows].sort((a, b) => b.profileXp - a.profileXp).slice(0, 8)

  return createPortal(
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#0F1117' }}>
      {/* Video */}
      <div style={{ background: '#000', aspectRatio: '16/9', position: 'relative', flexShrink: 0 }}>
        <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain', display: hasVideo ? 'block' : 'none' }} />
        {!hasVideo && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#6B7280' }}>
            Connecting…
          </div>
        )}
        <div style={{ position: 'absolute', top: 8, left: 8, background: '#F0047F', color: '#000', fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, letterSpacing: 1 }}>● LIVE</div>
      </div>

      {/* Streamer info */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid #2A2D3A', flexShrink: 0 }}>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 14, color: '#F0F0F0' }}>
          {streamer.avatarEmoji ?? '🎧'} {streamer.username}
        </div>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: '#6B7280', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {streamer.quest}
        </div>
        <div style={{ marginTop: 6, fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#FFB800' }}>
          HP {streamer.currentHealth} · ▲ {streamer.vouchCount} vouches
        </div>
      </div>

      {/* Mini leaderboard */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
        <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: 1.5, color: '#F0047F', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#F0047F', boxShadow: '0 0 4px #F0047F', display: 'inline-block' }} />
          LIVE LEADERBOARD
        </div>
        {sorted.length === 0 && (
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#6B7280' }}>No active streamers.</div>
        )}
        {sorted.map((row, i) => {
          const isCurrent = row.sessionId === streamer.sessionId
          return (
            <div key={row.sessionId} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
              background: isCurrent ? 'rgba(240, 4, 127, 0.12)' : '#16191F',
              border: `1px solid ${isCurrent ? 'rgba(240, 4, 127, 0.38)' : '#2A2D3A'}`,
              borderRadius: 5, marginBottom: 4,
            }}>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, color: '#6B7280', width: 18 }}>#{i + 1}</span>
              <span style={{ fontSize: 14 }}>{row.avatarEmoji ?? '🎧'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 11, color: '#F0F0F0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.username}
                </div>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.quest}
                </div>
              </div>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 9, color: row.currentHealth > 60 ? '#00E676' : row.currentHealth > 30 ? '#FFB800' : '#FF3B3B' }}>
                {row.currentHealth}
              </span>
            </div>
          )
        })}
      </div>
    </div>,
    pipWindow.document.body
  )
}
