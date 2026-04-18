import { RoomContext } from '@livekit/components-react'
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { resolveHostRoomName } from '../lib/livekitRoom'
import { getPublicEnv } from '../lib/runtimeEnv'
import { coerceHttpsUrl, coerceLiveKitServerUrl } from '../lib/secureUrls'

type JoinMode = 'host' | 'viewer'

interface StreamingContextValue {
  room: Room
  roomName: string
  shareLink: string
  isConnected: boolean
  connectAsHost: (userId: string) => Promise<void>
  connectAsViewer: (roomName: string) => Promise<void>
  disconnect: () => Promise<void>
  publishMultiplexedTracks: (videoTrack: MediaStreamTrack, audioTrack?: MediaStreamTrack) => Promise<void>
  unpublishMultiplexedTracks: () => void
}

const StreamingContext = createContext<StreamingContextValue | null>(null)

async function requestLiveKitToken(roomName: string, userId: string, mode: JoinMode) {
  const endpointRaw = getPublicEnv('VITE_LIVEKIT_TOKEN_ENDPOINT')
  const endpoint = endpointRaw ? coerceHttpsUrl(endpointRaw) : ''
  const fallbackToken = getPublicEnv('VITE_LIVEKIT_TOKEN')

  if (!endpoint) {
    if (!fallbackToken) {
      throw new Error(
        'Missing LiveKit token. Add VITE_LIVEKIT_TOKEN (or VITE_LIVEKIT_TOKEN_ENDPOINT) to .env at build time, or ship /runtime-config.json next to index.html on the server.',
      )
    }
    return fallbackToken
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomName,
      userId,
      canPublish: mode === 'host',
      canSubscribe: true,
    }),
  })

  if (!response.ok) {
    throw new Error(`Token request failed (${response.status})`)
  }

  const payload = (await response.json()) as { token?: string }
  if (!payload.token) {
    throw new Error('Token endpoint returned no token.')
  }
  return payload.token
}

export function StreamingProvider({ children }: { children: ReactNode }) {
  const [room] = useState(() => new Room())
  const [isConnected, setIsConnected] = useState(false)
  const [roomName, setRoomName] = useState('stream-anonymous')
  const publishedVideoRef = useRef<MediaStreamTrack | null>(null)
  const publishedAudioRef = useRef<MediaStreamTrack | null>(null)

  const wsUrl = useMemo(
    () => coerceLiveKitServerUrl(getPublicEnv('VITE_LIVEKIT_URL')),
    [],
  )
  const roomCtxValue = useMemo(() => room, [room])

  useEffect(() => {
    const onConnected = () => setIsConnected(true)
    const onDisconnected = () => setIsConnected(false)
    room.on(RoomEvent.Connected, onConnected)
    room.on(RoomEvent.Disconnected, onDisconnected)
    return () => {
      room.off(RoomEvent.Connected, onConnected)
      room.off(RoomEvent.Disconnected, onDisconnected)
    }
  }, [room])

  const connect = useCallback(
    async (nextRoomName: string, userId: string, mode: JoinMode) => {
      if (!wsUrl) {
        throw new Error(
          'Missing LiveKit URL. Set VITE_LIVEKIT_URL or override in /runtime-config.json.',
        )
      }

      const token = await requestLiveKitToken(nextRoomName, userId, mode)
      if (room.state !== ConnectionState.Disconnected) {
        await room.disconnect()
      }

      await room.connect(wsUrl, token, { autoSubscribe: true })
      setRoomName(nextRoomName)
    },
    [room, wsUrl],
  )

  const connectAsHost = useCallback(
    async (userId: string) => {
      const nextRoomName = resolveHostRoomName(userId)
      await connect(nextRoomName, userId, 'host')
    },
    [connect],
  )

  const connectAsViewer = useCallback(
    async (viewerRoomName: string) => {
      await connect(viewerRoomName, `viewer-${Date.now()}`, 'viewer')
    },
    [connect],
  )

  const unpublishMultiplexedTracks = useCallback(() => {
    if (publishedVideoRef.current) {
      room.localParticipant.unpublishTrack(publishedVideoRef.current)
      publishedVideoRef.current = null
    }
    if (publishedAudioRef.current) {
      room.localParticipant.unpublishTrack(publishedAudioRef.current)
      publishedAudioRef.current = null
    }
  }, [room])

  const publishMultiplexedTracks = useCallback(
    async (videoTrack: MediaStreamTrack, audioTrack?: MediaStreamTrack) => {
      if (room.state !== ConnectionState.Connected) {
        throw new Error('Room not connected. Join as host before publishing.')
      }
      unpublishMultiplexedTracks()

      await room.localParticipant.publishTrack(videoTrack, {
        source: Track.Source.ScreenShare,
        simulcast: false,
        videoCodec: 'vp8',
      })
      publishedVideoRef.current = videoTrack

      if (audioTrack) {
        await room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.Microphone,
        })
        publishedAudioRef.current = audioTrack
      }
    },
    [room, unpublishMultiplexedTracks],
  )

  const disconnect = useCallback(async () => {
    unpublishMultiplexedTracks()
    await room.disconnect()
  }, [room, unpublishMultiplexedTracks])

  const shareLink = useMemo(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('room', roomName)
    url.searchParams.set('mode', 'viewer')
    return url.toString()
  }, [roomName])

  const value = useMemo<StreamingContextValue>(
    () => ({
      room,
      roomName,
      shareLink,
      isConnected,
      connectAsHost,
      connectAsViewer,
      disconnect,
      publishMultiplexedTracks,
      unpublishMultiplexedTracks,
    }),
    [
      room,
      roomName,
      shareLink,
      isConnected,
      connectAsHost,
      connectAsViewer,
      disconnect,
      publishMultiplexedTracks,
      unpublishMultiplexedTracks,
    ],
  )

  return (
    <StreamingContext.Provider value={value}>
      <RoomContext.Provider value={roomCtxValue}>{children}</RoomContext.Provider>
    </StreamingContext.Provider>
  )
}

// Hook colocated with provider; Fast Refresh keeps working for the default export pattern in this bundle.
// eslint-disable-next-line react-refresh/only-export-components -- useStreaming must share StreamingContext
export function useStreaming() {
  const ctx = useContext(StreamingContext)
  if (!ctx) {
    throw new Error('useStreaming must be used within StreamingProvider.')
  }
  return ctx
}
