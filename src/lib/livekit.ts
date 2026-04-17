import { Room } from 'livekit-client'

export interface LiveKitSession {
  room: Room
  wsUrl: string
  token: string
  ready: boolean
}

export function createLiveKitSession(): LiveKitSession {
  const wsUrl = import.meta.env.VITE_LIVEKIT_URL ?? ''
  const token = import.meta.env.VITE_LIVEKIT_TOKEN ?? ''
  const room = new Room()

  return {
    room,
    wsUrl,
    token,
    ready: Boolean(wsUrl && token),
  }
}
