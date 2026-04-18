import {
  RoomEvent,
  Track,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
  type Room,
} from 'livekit-client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useStreaming } from '../providers/StreamingProvider'

function findBestRemoteVideo(room: Room): RemoteVideoTrack | null {
  let screenShare: RemoteVideoTrack | null = null
  let fallback: RemoteVideoTrack | null = null
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.videoTrackPublications.values()) {
      if (!pub.isSubscribed || !pub.track) continue
      const video = pub.track as RemoteVideoTrack
      if (pub.source === Track.Source.ScreenShare) {
        screenShare = video
      } else if (!fallback) {
        fallback = video
      }
    }
  }
  return screenShare ?? fallback
}

function findRemoteMic(room: Room): RemoteAudioTrack | null {
  for (const participant of room.remoteParticipants.values()) {
    for (const pub of participant.audioTrackPublications.values()) {
      if (!pub.isSubscribed || !pub.track) continue
      if (pub.source === Track.Source.Microphone) {
        return pub.track as RemoteAudioTrack
      }
    }
  }
  return null
}

export function ViewerStage() {
  const { room, isConnected } = useStreaming()
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const attachedVideoRef = useRef<RemoteVideoTrack | null>(null)
  const attachedAudioRef = useRef<RemoteAudioTrack | null>(null)
  const [audioHint, setAudioHint] = useState<string | null>(null)

  const syncMedia = useCallback(() => {
    const videoEl = videoRef.current
    const audioEl = audioRef.current
    if (!videoEl || !audioEl) return

    const nextVideo = findBestRemoteVideo(room)
    if (attachedVideoRef.current && attachedVideoRef.current !== nextVideo) {
      attachedVideoRef.current.detach(videoEl)
      attachedVideoRef.current = null
    }
    if (nextVideo) {
      nextVideo.attach(videoEl)
      void videoEl.play().catch(() => {})
      attachedVideoRef.current = nextVideo
    } else {
      attachedVideoRef.current = null
    }

    const nextAudio = findRemoteMic(room)
    if (attachedAudioRef.current && attachedAudioRef.current !== nextAudio) {
      attachedAudioRef.current.detach(audioEl)
      attachedAudioRef.current = null
    }
    if (nextAudio) {
      nextAudio.attach(audioEl)
      attachedAudioRef.current = nextAudio
    } else {
      attachedAudioRef.current = null
    }
  }, [room])

  useEffect(() => {
    if (!isConnected) {
      const v = videoRef.current
      const a = audioRef.current
      if (attachedVideoRef.current && v) {
        attachedVideoRef.current.detach(v)
        attachedVideoRef.current = null
      }
      if (attachedAudioRef.current && a) {
        attachedAudioRef.current.detach(a)
        attachedAudioRef.current = null
      }
      return
    }

    syncMedia()

    const onTrackSubscribed = () => {
      syncMedia()
    }
    const onTrackUnsubscribed = () => {
      syncMedia()
    }
    const onParticipantConnected = () => {
      syncMedia()
    }
    const onParticipantDisconnected = () => {
      syncMedia()
    }

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed)
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected)
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)

    return () => {
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed)
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed)
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected)
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected)
    }
  }, [isConnected, room, syncMedia])

  const enableAudioPlayback = async () => {
    setAudioHint(null)
    try {
      await room.startAudio()
      const audioEl = audioRef.current
      if (audioEl) await audioEl.play()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Audio unlock failed.'
      setAudioHint(message)
    }
  }

  return (
    <div className="viewer-stage stack">
      <video ref={videoRef} className="viewer-stage__video" autoPlay playsInline muted />
      <audio ref={audioRef} autoPlay className="viewer-stage__audio" />
      <div className="actions">
        <button className="btn btn--primary" type="button" onClick={() => void enableAudioPlayback()}>
          UNLOCK AUDIO PLAYBACK
        </button>
      </div>
      <p className="viewer-stage__note">
        Browsers block remote audio until you interact with the page. If you hear nothing after the host goes live,
        tap the button above.
      </p>
      {audioHint ? <p className="error">{audioHint}</p> : null}
    </div>
  )
}
