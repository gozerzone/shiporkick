import { getPublicEnv } from './runtimeEnv'

/** Sanitized room slug derived from host user id (dynamic rooms / token endpoint flow). */
export function buildRoomSlug(userId: string): string {
  const sanitized = userId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return `stream-${sanitized || 'anonymous'}`
}

/**
 * Room name when joining as host.
 * With `VITE_LIVEKIT_TOKEN` (no endpoint), the JWT is usually minted for one fixed room —
 * set `VITE_LIVEKIT_ROOM` to match that room name. With `VITE_LIVEKIT_TOKEN_ENDPOINT`,
 * the server can mint per-room tokens; we then use a slug per host user id.
 */
export function resolveHostRoomName(userId: string): string {
  const hasEndpoint = Boolean(getPublicEnv('VITE_LIVEKIT_TOKEN_ENDPOINT'))
  if (hasEndpoint) {
    return buildRoomSlug(userId)
  }
  const fixed = getPublicEnv('VITE_LIVEKIT_ROOM')
  if (fixed) return fixed
  return buildRoomSlug(userId)
}

export function liveKitStaticTokenNeedsRoomHint(): boolean {
  return Boolean(
    getPublicEnv('VITE_LIVEKIT_TOKEN') &&
      !getPublicEnv('VITE_LIVEKIT_TOKEN_ENDPOINT') &&
      !getPublicEnv('VITE_LIVEKIT_ROOM'),
  )
}
