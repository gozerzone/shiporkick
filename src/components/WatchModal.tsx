import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
} from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchViewerToken } from '../lib/livekitViewerToken'
import { getPublicEnv } from '../lib/runtimeEnv'
import { coerceLiveKitServerUrl } from '../lib/secureUrls'
import { spendJerk, spendVouch } from '../lib/tokens'
import type { LeaderboardStreamer } from '../lib/globalLeaderboardRealtime'

const XP_SEGMENT = 500

function hpColor(hp: number) {
  if (hp > 60) return 'var(--green)'
  if (hp > 30) return 'var(--gold)'
  return 'var(--danger)'
}

function findBestRemoteVideo(room: Room): RemoteVideoTrack | null {
  let screenShare: RemoteVideoTrack | null = null
  let fallback: RemoteVideoTrack | null = null
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.videoTrackPublications.values()) {
      if (!pub.isSubscribed || !pub.track) continue
      const v = pub.track as RemoteVideoTrack
      if (pub.source === Track.Source.ScreenShare) screenShare = v
      else if (!fallback) fallback = v
    }
  }
  return screenShare ?? fallback
}

function findRemoteAudio(room: Room): RemoteAudioTrack | null {
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.audioTrackPublications.values()) {
      if (!pub.isSubscribed || !pub.track) continue
      return pub.track as RemoteAudioTrack
    }
  }
  return null
}

interface WatchModalProps {
  streamer: LeaderboardStreamer
  clerkUserId: string | null
  authUserId?: string | null
  myProfileId: string | null
  onClose: () => void
  onTokenEconomyChanged?: () => void
  onPopOutWithLeaderboard?: () => void
}

export function WatchModal({ streamer, clerkUserId, authUserId, myProfileId, onClose, onTokenEconomyChanged, onPopOutWithLeaderboard }: WatchModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const roomRef = useRef<Room | null>(null)
  const attachedVideoRef = useRef<RemoteVideoTrack | null>(null)
  const attachedAudioRef = useRef<RemoteAudioTrack | null>(null)
  const [status, setStatus] = useState<'connecting' | 'live' | 'no-stream' | 'error'>('connecting')
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isSelf = Boolean(myProfileId && streamer.profileId && myProfileId === streamer.profileId)
  const canAct = Boolean(authUserId || clerkUserId) && !isSelf
  const xpMod = ((streamer.profileXp % XP_SEGMENT) + XP_SEGMENT) % XP_SEGMENT

  const syncMedia = useCallback((room: Room) => {
    const videoEl = videoRef.current
    const audioEl = audioRef.current
    if (!videoEl || !audioEl) return

    const nextVideo = findBestRemoteVideo(room)
    if (attachedVideoRef.current !== nextVideo) {
      if (attachedVideoRef.current) attachedVideoRef.current.detach(videoEl)
      if (nextVideo) { nextVideo.attach(videoEl); void videoEl.play().catch(() => {}) }
      attachedVideoRef.current = nextVideo
    }

    const nextAudio = findRemoteAudio(room)
    if (attachedAudioRef.current !== nextAudio) {
      if (attachedAudioRef.current) attachedAudioRef.current.detach(audioEl)
      if (nextAudio) { nextAudio.attach(audioEl); void audioEl.play().catch(() => {}) }
      attachedAudioRef.current = nextAudio
    }

    if (nextVideo) setStatus('live')
    else setStatus('no-stream')
  }, [])

  useEffect(() => {
    const wsUrl = coerceLiveKitServerUrl(getPublicEnv('VITE_LIVEKIT_URL'))
    const room = new Room()
    roomRef.current = room
    let cancelled = false

    // Register events BEFORE connect so no TrackSubscribed fires are missed
    const sync = () => { if (!cancelled) syncMedia(room) }
    room.on(RoomEvent.TrackSubscribed, sync)
    room.on(RoomEvent.TrackUnsubscribed, sync)
    room.on(RoomEvent.ParticipantConnected, sync)
    room.on(RoomEvent.ParticipantDisconnected, sync)
    room.on(RoomEvent.Disconnected, () => { if (!cancelled) setStatus('no-stream') })

    void (async () => {
      try {
        const slug = streamer.username ? `stream-${streamer.username.toLowerCase().replace(/[^a-z0-9_-]/g, '-')}` : 'stream-anonymous'
        const roomName = streamer.livekitRoom || slug
        const token = await fetchViewerToken(roomName)
        if (cancelled) return
        await room.connect(wsUrl, token, { autoSubscribe: true })
        if (cancelled) { await room.disconnect(); return }
        sync()
      } catch {
        if (!cancelled) setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      const v = videoRef.current
      const a = audioRef.current
      if (attachedVideoRef.current && v) attachedVideoRef.current.detach(v)
      if (attachedAudioRef.current && a) attachedAudioRef.current.detach(a)
      if (room.state !== ConnectionState.Disconnected) void room.disconnect()
      roomRef.current = null
    }
  }, [syncMedia, streamer.livekitRoom])

  const onKick = async () => {
    if (!authUserId && !clerkUserId) return
    setBusy(true); setNotice(null)
    try {
      await spendJerk(streamer.sessionId)
      setNotice('Jerk sent.')
      onTokenEconomyChanged?.()
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Failed.') }
    finally { setBusy(false) }
  }

  const onVouch = async () => {
    if (!authUserId && !clerkUserId) return
    setBusy(true); setNotice(null)
    try {
      await spendVouch(streamer.sessionId)
      setNotice('Vouch applied.')
      onTokenEconomyChanged?.()
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Failed.') }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="watch-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="watch-modal__header">
          <div>
            <div className="watch-modal__name">{streamer.username}</div>
            <div className="watch-modal__quest">{streamer.quest}</div>
          </div>
          <button type="button" className="modal-box__close" onClick={onClose}>✕</button>
        </div>

        {/* Stream */}
        <div className="watch-modal__stage">
          <video ref={videoRef} autoPlay playsInline muted className="watch-modal__video" />
          <audio ref={audioRef} autoPlay />
          {status === 'connecting' && (
            <div className="watch-modal__overlay-text">Connecting...</div>
          )}
          {status === 'no-stream' && (
            <div className="watch-modal__overlay-text" style={{ flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 16, color: 'var(--muted)', fontWeight: 700, letterSpacing: 1 }}>NOT CURRENTLY STREAMING</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.7 }}>This streamer's session is recorded but no live video is being broadcast.</div>
            </div>
          )}
          {status === 'error' && (
            <div className="watch-modal__overlay-text" style={{ color: 'var(--danger)' }}>Connection failed</div>
          )}
          {status === 'live' && (
            <div className="watch-modal__live-badge">● LIVE</div>
          )}
          {status === 'live' && (
            <div className="watch-modal__video-controls">
              {onPopOutWithLeaderboard && (
                <button
                  type="button"
                  className="watch-modal__video-btn"
                  onClick={() => onPopOutWithLeaderboard()}
                  title="Pop out with leaderboard (floats above all windows)"
                  aria-label="Pop out with leaderboard"
                >🪟</button>
              )}
              <button
                type="button"
                className="watch-modal__video-btn"
                onClick={async () => {
                  const el = videoRef.current
                  if (!el) return
                  try {
                    if (document.pictureInPictureElement) {
                      await document.exitPictureInPicture()
                    } else {
                      await el.requestPictureInPicture?.()
                      onClose()
                    }
                  } catch { /* PiP not supported or denied */ }
                }}
                title="Pop out video only"
                aria-label="Picture in picture"
              >⧉</button>
              <button
                type="button"
                className="watch-modal__video-btn"
                onClick={() => {
                  const el = videoRef.current
                  if (!el) return
                  if (document.fullscreenElement) void document.exitFullscreen()
                  else void el.requestFullscreen?.().catch(() => {})
                }}
                title="Fullscreen"
                aria-label="Fullscreen"
              >⛶</button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="watch-modal__stats">
          <div className="hp-bar" style={{ flex: '1 1 120px' }}>
            <span className="hp-bar__label">HP</span>
            <div className="hp-bar__track">
              <div className="hp-bar__fill" style={{ width: `${streamer.currentHealth}%`, background: hpColor(streamer.currentHealth) }} />
            </div>
            <span className="hp-bar__value" style={{ color: hpColor(streamer.currentHealth) }}>{streamer.currentHealth}</span>
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--gold)' }}>▲{streamer.vouchCount}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)' }}>{xpMod}/{XP_SEGMENT} XP</span>
          {streamer.workCategory && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--muted)', background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px' }}>
              {streamer.workCategory}
            </span>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-danger" style={{ flex: 1 }} disabled={!canAct || busy} onClick={() => void onKick()}>
            🔌 JERK
          </button>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} disabled={!canAct || busy} onClick={() => void onVouch()}>
            ▲ VOUCH
          </button>
        </div>
        {!authUserId && !clerkUserId && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>Sign in to jerk or vouch</p>}
        {isSelf && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>This is your stream</p>}
        {notice && <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--muted)', textAlign: 'center' }}>{notice}</p>}
      </div>
    </div>
  )
}
