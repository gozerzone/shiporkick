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
  const hasEndpoint = Boolean(import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT?.trim())
  if (hasEndpoint) {
    return buildRoomSlug(userId)
  }
  const fixed = import.meta.env.VITE_LIVEKIT_ROOM?.trim()
  if (fixed) return fixed
  return buildRoomSlug(userId)
}

export function liveKitStaticTokenNeedsRoomHint(): boolean {
  return Boolean(
    import.meta.env.VITE_LIVEKIT_TOKEN?.trim() &&
      !import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT?.trim() &&
      !import.meta.env.VITE_LIVEKIT_ROOM?.trim(),
  )
}
