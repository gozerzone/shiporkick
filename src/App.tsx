import { useEffect, useMemo, useState } from 'react'
import { Bounty } from './components/Bounty'
import { FoulButton } from './components/FoulButton'
import { GlobalLeaderboard } from './components/GlobalLeaderboard'
import { StreamerHUD } from './components/StreamerHUD'
import { StreamMultiplexer } from './components/StreamMultiplexer'
import { ViewerStage } from './components/ViewerStage'
import { WastedOverlay } from './components/WastedOverlay'
import { getAuthContext, type AuthProvider } from './lib/auth'
import { liveKitStaticTokenNeedsRoomHint } from './lib/livekitRoom'
import { subscribeToSessionHealth } from './lib/sessionHealthRealtime'
import { useStreaming } from './providers/StreamingProvider'

const COOLDOWN_MS = 5 * 60 * 1000
const COOLDOWN_STORAGE_KEY = 'shiporkick.procrastination-cooldown-until'

function App() {
  const { connectAsViewer, isConnected, roomName, shareLink } = useStreaming()
  const [authProvider, setAuthProvider] = useState<AuthProvider>('clerk')
  const [userId, setUserId] = useState('operator-001')
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [viewerSessionId, setViewerSessionId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [currentHealth, setCurrentHealth] = useState(100)
  const [kickSignal, setKickSignal] = useState(0)
  const [isWasted, setIsWasted] = useState(false)
  const [isLobbyMode, setIsLobbyMode] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const auth = useMemo(() => getAuthContext(authProvider), [authProvider])
  const hasEndpoint = Boolean(import.meta.env.VITE_LIVEKIT_URL)
  const hasTokenFlow = Boolean(
    import.meta.env.VITE_LIVEKIT_TOKEN_ENDPOINT || import.meta.env.VITE_LIVEKIT_TOKEN,
  )
  const liveKitRoomHintNeeded = liveKitStaticTokenNeedsRoomHint()
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0)
  const displayCooldownMs = cooldownUntil ? cooldownRemainingMs : 0
  const cooldownRemainingMinutes = Math.ceil(displayCooldownMs / 60000)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mode = params.get('mode')
    const room = params.get('room')
    const session = params.get('session')
    const cooldownUntilParam = params.get('cooldown_until')
    const storedCooldown = Number(window.localStorage.getItem(COOLDOWN_STORAGE_KEY) ?? '')
    const parsedCooldown = Number(cooldownUntilParam ?? '')
    const nextCooldown =
      Number.isFinite(parsedCooldown) && parsedCooldown > 0 ? parsedCooldown : storedCooldown

    queueMicrotask(() => {
      if (nextCooldown > Date.now()) {
        setCooldownUntil(nextCooldown)
        setIsLobbyMode(true)
        window.localStorage.setItem(COOLDOWN_STORAGE_KEY, String(nextCooldown))
      } else {
        window.localStorage.removeItem(COOLDOWN_STORAGE_KEY)
      }

      if (mode !== 'viewer' || !room) return
      setViewerSessionId(session)
      setActiveSessionId(session)

      void (async () => {
        try {
          await connectAsViewer(room)
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Viewer join failed.'
          setViewerError(message)
        }
      })()
    })
  }, [connectAsViewer])

  useEffect(() => {
    if (viewerSessionId || !activeSessionId) return

    try {
      const unsubscribe = subscribeToSessionHealth(activeSessionId, (health) => {
        setCurrentHealth(health)
      })
      return unsubscribe
    } catch {
      return
    }
  }, [activeSessionId, viewerSessionId])

  useEffect(() => {
    if (!cooldownUntil) return
    const tick = () => {
      const ms = Math.max(0, cooldownUntil - Date.now())
      setCooldownRemainingMs(ms)
      if (ms > 0) return
      setCooldownUntil(null)
      setIsLobbyMode(false)
      window.localStorage.removeItem(COOLDOWN_STORAGE_KEY)
      window.history.replaceState({}, '', `${window.location.pathname}`)
    }
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [cooldownUntil])

  useEffect(() => {
    if (viewerSessionId || currentHealth > 0 || isWasted) return

    const runKickSequence = () => {
      setIsWasted(true)
      setKickSignal((prev) => prev + 1)

      const until = Date.now() + COOLDOWN_MS
      window.localStorage.setItem(COOLDOWN_STORAGE_KEY, String(until))

      window.setTimeout(() => {
        const url = new URL(window.location.href)
        url.search = ''
        url.searchParams.set('mode', 'lobby')
        url.searchParams.set('cooldown_until', String(until))
        window.location.href = url.toString()
      }, 2400)
    }

    runKickSequence()
  }, [currentHealth, isWasted, viewerSessionId])

  return (
    <main className="app">
      <section className="panel panel--hero">
        <p className="eyebrow">SHIP OR KICK // STREAMER OPS</p>
        <h1 className="title">Streamer Dashboard</h1>
        <p className="subtitle">
          One-button startup for screen plus camera capture and sub-second LiveKit delivery.
        </p>
        <p>Use the multiplexer below to arm simultaneous screen + camera capture.</p>
        {isLobbyMode && displayCooldownMs > 0 ? (
          <p className="error">
            PROCRASTINATION COOLDOWN ACTIVE: {cooldownRemainingMinutes} minute(s) remaining.
          </p>
        ) : null}
        {viewerError ? <p className="error">Viewer mode error: {viewerError}</p> : null}
      </section>
      {!viewerSessionId ? <GlobalLeaderboard /> : null}

      <section className="grid">
        <article className="panel">
          <h2 className="panel__title">Auth Integration Placeholder</h2>
          <div className="stack">
            <label htmlFor="authProvider">Provider</label>
            <select
              id="authProvider"
              className="select"
              value={authProvider}
              onChange={(event) => setAuthProvider(event.target.value as AuthProvider)}
            >
              <option value="clerk">Clerk</option>
              <option value="supabase">Supabase</option>
            </select>
            <p>Status: {auth.status.toUpperCase()}</p>
            <p>{auth.hint}</p>
          </div>
        </article>

        <article className="panel">
          <h2 className="panel__title">LiveKit Streaming Bootstrap</h2>
          <div className="stack">
            <label htmlFor="userId">Host User ID</label>
            <input
              id="userId"
              className="select"
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
            />
            <p>Endpoint: {hasEndpoint ? 'READY' : 'Missing VITE_LIVEKIT_URL'}</p>
            <p>Token flow: {hasTokenFlow ? 'READY' : 'Missing token endpoint/token'}</p>
            {liveKitRoomHintNeeded ? (
              <p className="error">
                Static LiveKit token in use without VITE_LIVEKIT_ROOM. Set VITE_LIVEKIT_ROOM to the same room name
                baked into that JWT, or switch to VITE_LIVEKIT_TOKEN_ENDPOINT. Otherwise joins fail or tracks never
                publish.
              </p>
            ) : null}
            <p>Connection: {isConnected ? 'CONNECTED' : 'DISCONNECTED'}</p>
            <p>Room: {roomName}</p>
            <p>Share Link: {shareLink}</p>
          </div>
        </article>

        <article className="panel panel--preview">
          <h2 className="panel__title">{viewerSessionId ? 'Viewer Controls' : 'Stream Multiplexer'}</h2>
          {viewerSessionId ? (
            <div className="stack">
              <ViewerStage />
              <FoulButton sessionId={viewerSessionId} />
              <Bounty sessionId={viewerSessionId} />
            </div>
          ) : (
            <StreamMultiplexer
              userId={userId}
              disabled={isLobbyMode && displayCooldownMs > 0}
              kickSignal={kickSignal}
            />
          )}
        </article>
      </section>
      {!viewerSessionId ? (
        <StreamerHUD
          taskOfHour="Ship the live demo before the timer hits zero."
          currentHealth={currentHealth}
          xp={340}
          xpToNextLevel={500}
        />
      ) : null}
      <WastedOverlay visible={isWasted} />
    </main>
  )
}

export default App
