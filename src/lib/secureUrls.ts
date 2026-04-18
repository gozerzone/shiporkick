/**
 * On HTTPS pages, `http://` fetches and `ws://` sockets count as mixed content; browsers show a
 * broken lock / warning even when the page “works”. Normalize env URLs when the page is a secure context.
 */
export function coerceHttpsUrl(url: string): string {
  const u = url.trim()
  if (!u) return u
  if (typeof window !== 'undefined' && window.isSecureContext && u.startsWith('http://')) {
    return `https://${u.slice('http://'.length)}`
  }
  return u
}

/** LiveKit expects a WebSocket URL; `ws://` on an HTTPS site is mixed content — use `wss://`. */
export function coerceLiveKitServerUrl(url: string): string {
  const u = url.trim()
  if (!u) return u
  if (typeof window !== 'undefined' && window.isSecureContext && u.startsWith('ws://')) {
    return `wss://${u.slice('ws://'.length)}`
  }
  return u
}
