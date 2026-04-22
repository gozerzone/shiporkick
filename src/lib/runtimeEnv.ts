/**
 * Merges optional runtime JSON (same origin, next to index.html on Cloudways) with Vite
 * `import.meta.env`. Tries `/runtime-config.json` then `/shiporkick-runtime.json` (identical
 * copy) because some stacks incorrectly 404 the first path.
 *
 * ShipOrKick LiveKit Cloud host is safe to default; JWT and DB keys must still be supplied.
 */
const ALLOWED_KEYS = new Set([
  'VITE_LIVEKIT_URL',
  'VITE_LIVEKIT_TOKEN',
  'VITE_LIVEKIT_TOKEN_ENDPOINT',
  'VITE_LIVEKIT_ROOM',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_CLERK_PUBLISHABLE_KEY',
])

/** When env + runtime JSON omit the URL, use this project’s LiveKit Cloud host (override anytime). */
const FALLBACK_DEFAULTS: Partial<Record<string, string>> = {
  VITE_LIVEKIT_URL: 'wss://shiporkick-1bnt2hsb.livekit.cloud',
}

let runtimePayload: Record<string, string> = {}
let merged: Record<string, string> | null = null

function readViteEnv(key: string): string {
  const raw = (import.meta.env as Record<string, string | boolean | undefined>)[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

function buildMerged(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of ALLOWED_KEYS) {
    const fromRuntime = (runtimePayload[key] ?? '').trim()
    const fromVite = readViteEnv(key)
    const primary = fromRuntime || fromVite
    const fallback = (FALLBACK_DEFAULTS[key as keyof typeof FALLBACK_DEFAULTS] ?? '').trim()
    out[key] = primary || fallback || ''
  }
  return out
}

/** Call once before React root mounts (see main.tsx). */
const RUNTIME_JSON_PATHS = ['/runtime-config.json', '/shiporkick-runtime.json']

const RUNTIME_FETCH_MS = 6000

function fetchRuntimeJson(url: string): Promise<Response> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), RUNTIME_FETCH_MS)
  return fetch(`${url}?${Date.now()}`, { cache: 'no-store', signal: controller.signal }).finally(() =>
    window.clearTimeout(timer),
  )
}

export async function loadRuntimeConfig(): Promise<void> {
  merged = null
  runtimePayload = {}
  try {
    for (const basePath of RUNTIME_JSON_PATHS) {
      let res: Response
      try {
        res = await fetchRuntimeJson(basePath)
      } catch {
        continue
      }
      if (!res.ok) continue

      const json = (await res.json()) as Record<string, unknown>
      for (const [k, v] of Object.entries(json)) {
        if (ALLOWED_KEYS.has(k) && typeof v === 'string') {
          runtimePayload[k] = v.trim()
        }
      }
      break
    }
  } catch {
    /* missing file or invalid JSON — use build/env only */
  } finally {
    merged = buildMerged()
  }
}

export function getPublicEnv(key: string): string {
  if (!ALLOWED_KEYS.has(key)) return ''
  if (!merged) merged = buildMerged()
  return merged[key] ?? ''
}
