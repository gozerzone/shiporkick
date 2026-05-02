import { readJwtExpUnix } from './jwtPayload'
import { getPublicEnv } from './runtimeEnv'
import { coerceHttpsUrl } from './secureUrls'

export async function fetchViewerToken(roomName: string): Promise<string> {
  const endpointRaw = getPublicEnv('VITE_LIVEKIT_TOKEN_ENDPOINT')
  const endpoint = endpointRaw ? coerceHttpsUrl(endpointRaw) : ''

  if (endpoint) {
    const userId = `viewer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, userId, canPublish: false, canSubscribe: true }),
    })
    if (!res.ok) throw new Error(`Token endpoint returned ${res.status}`)
    const data = (await res.json()) as { token?: string }
    if (!data.token) throw new Error('Token endpoint returned no token.')
    return data.token
  }

  const fallback = getPublicEnv('VITE_LIVEKIT_TOKEN')
  if (!fallback) throw new Error('No LiveKit token configured.')
  const exp = readJwtExpUnix(fallback)
  if (exp !== null && exp <= Math.floor(Date.now() / 1000) + 60) {
    throw new Error('LiveKit token is expired.')
  }
  return fallback
}
