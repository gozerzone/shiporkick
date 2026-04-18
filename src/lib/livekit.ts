import { Room } from 'livekit-client'
import { getPublicEnv } from './runtimeEnv'

export interface LiveKitSession {
  room: Room
  wsUrl: string
  token: string
  ready: boolean
}

export function createLiveKitSession(): LiveKitSession {
  const wsUrl = getPublicEnv('VITE_LIVEKIT_URL')
  const token = getPublicEnv('VITE_LIVEKIT_TOKEN')
  const room = new Room()

  return {
    room,
    wsUrl,
    token,
    ready: Boolean(wsUrl && token),
  }
}
