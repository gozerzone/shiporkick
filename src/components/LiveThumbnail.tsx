import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  VideoQuality,
  type RemoteVideoTrack,
} from 'livekit-client'
import { useEffect, useRef, useState } from 'react'
import { fetchViewerToken } from '../lib/livekitViewerToken'
import { getPublicEnv } from '../lib/runtimeEnv'
import { coerceLiveKitServerUrl } from '../lib/secureUrls'
import type { LeaderboardStreamer } from '../lib/globalLeaderboardRealtime'

interface LiveThumbnailProps {
  streamer: LeaderboardStreamer
  onClick: () => void
  compact?: boolean
}

function findBestTrack(room: Room): RemoteVideoTrack | null {
  let screen: RemoteVideoTrack | null = null
  let fallback: RemoteVideoTrack | null = null
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.videoTrackPublications.values()) {
      if (!pub.isSubscribed || !pub.track) continue
      const t = pub.track as RemoteVideoTrack
      if (pub.source === Track.Source.ScreenShare) screen = t
      else if (!fallback) fallback = t
    }
  }
  return screen ?? fallback
}

export function LiveThumbnail({ streamer, onClick, compact = false }: LiveThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const attachedRef = useRef<RemoteVideoTrack | null>(null)
  const [hasVideo, setHasVideo] = useState(false)

  useEffect(() => {
    const wsUrl = coerceLiveKitServerUrl(getPublicEnv('VITE_LIVEKIT_URL'))
    const room = new Room()
    let cancelled = false

    const sync = () => {
      if (cancelled) return
      const el = videoRef.current
      const best = findBestTrack(room)
      if (attachedRef.current !== best) {
        if (attachedRef.current && el) attachedRef.current.detach(el)
        if (best && el) {
          best.attach(el)
          void el.play().catch(() => {})
          // For inline thumbnails, request the lowest simulcast layer to save bandwidth.
          // Each thumbnail = 1 LiveKit subscription; LOW layer is ~150 kbps vs ~1 Mbps for HIGH.
          if (compact) {
            for (const p of room.remoteParticipants.values()) {
              for (const pub of p.videoTrackPublications.values()) {
                if (pub.track === best) pub.setVideoQuality?.(VideoQuality.LOW)
              }
            }
          }
        }
        attachedRef.current = best
      }
      setHasVideo(!!best)
    }

    // Register events BEFORE connect so no TrackSubscribed fires are missed
    room.on(RoomEvent.TrackSubscribed, sync)
    room.on(RoomEvent.TrackUnsubscribed, sync)
    room.on(RoomEvent.ParticipantConnected, sync)
    room.on(RoomEvent.Disconnected, () => { if (!cancelled) setHasVideo(false) })

    void (async () => {
      try {
        // Each host has their own room (slug from userId). For sessions created before
        // livekit_room was tracked, derive it from the username.
        const slug = streamer.username ? `stream-${streamer.username.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}` : 'stream-anonymous'
        const roomName = streamer.livekitRoom || slug
        const token = await fetchViewerToken(roomName)
        if (cancelled) return
        await room.connect(wsUrl, token, { autoSubscribe: true })
        if (cancelled) { void room.disconnect(); return }
        sync()
      } catch { /* stream offline or network issue */ }
    })()

    return () => {
      cancelled = true
      const el = videoRef.current
      if (attachedRef.current && el) attachedRef.current.detach(el)
      attachedRef.current = null
      if (room.state !== ConnectionState.Disconnected) void room.disconnect()
    }
  }, [streamer.livekitRoom, compact])

  if (compact) {
    return (
      <button type="button" onClick={onClick} className="stream-thumb stream-thumb--compact" title="Click to watch">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: hasVideo ? 'block' : 'none' }}
        />
        {!hasVideo && <div className="stream-thumb__placeholder">▶</div>}
        {hasVideo && <div className="stream-thumb__live">●</div>}
      </button>
    )
  }

  return (
    <button type="button" onClick={onClick} className="stream-thumb">
      <div className="stream-thumb__stage">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: hasVideo ? 'block' : 'none' }}
        />
        {!hasVideo && <div className="stream-thumb__placeholder">▶</div>}
        <div className="stream-thumb__live">LIVE</div>
      </div>
      <div className="stream-thumb__info">
        <div className="stream-thumb__name">{streamer.username}</div>
        <div className="stream-thumb__quest">{streamer.quest}</div>
      </div>
    </button>
  )
}
