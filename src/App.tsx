import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bounty } from './components/Bounty'
import { ClerkAuthBar } from './components/ClerkAuthBar'
import { FoulButton } from './components/FoulButton'
import { GlobalLeaderboard } from './components/GlobalLeaderboard'
import { StreamerMessages } from './components/StreamerMessages'
import { StreamerHUD } from './components/StreamerHUD'
import { StreamMultiplexer } from './components/StreamMultiplexer'
import { ViewerStage } from './components/ViewerStage'
import { WastedOverlay } from './components/WastedOverlay'
import { liveKitStaticTokenNeedsRoomHint } from './lib/livekitRoom'
import { subscribeToProfileShield } from './lib/profileShieldRealtime'
import { publicDb } from './lib/publicSupabase'
import { getPublicEnv } from './lib/runtimeEnv'
import { subscribeToSessionHud } from './lib/sessionHealthRealtime'
import {
  activateDeepWorkShield,
  fetchProfileIdForClerk,
  fetchTokenBalances,
  type TokenBalances,
} from './lib/tokens'
import { normalizeWorkCategory, WORK_CATEGORIES, type WorkCategory } from './lib/workCategories'
import { useStreaming } from './providers/StreamingProvider'

const COOLDOWN_MS = 5 * 60 * 1000
const COOLDOWN_STORAGE_KEY = 'shiporkick.procrastination-cooldown-until'
const PROFILE_STORE_KEY = 'shiporkick.user-profiles'
const GUEST_ID_KEY = 'shiporkick.guest-id'
const HOUR_MS = 60 * 60 * 1000
const SCREEN_ONLY_CREDIT_MS = 3 * HOUR_MS

type LoginMode = 'guest' | 'account'

interface UserProfile {
  displayName: string
  quest: string
  workCategory?: WorkCategory
  totalStreamMs: number
  screenOnlyStreamMs?: number
}

function slugify(input: string) {
  const trimmed = input.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return trimmed || 'operator-001'
}

function getGuestId() {
  const existing = window.localStorage.getItem(GUEST_ID_KEY)
  if (existing) return existing
  const generated = `guest-${Math.random().toString(36).slice(2, 8)}`
  window.localStorage.setItem(GUEST_ID_KEY, generated)
  return generated
}

function readProfiles(): Record<string, UserProfile> {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, UserProfile>
  } catch {
    return {}
  }
}

function writeProfiles(profiles: Record<string, UserProfile>) {
  window.localStorage.setItem(PROFILE_STORE_KEY, JSON.stringify(profiles))
}

function App() {
  const { connectAsViewer, isConnected, roomName, shareLink } = useStreaming()
  const [loginMode, setLoginMode] = useState<LoginMode>('guest')
  const [accountIdDraft, setAccountIdDraft] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('operator-001')
  const [displayName, setDisplayName] = useState('Guest Streamer')
  const [taskOfHour, setTaskOfHour] = useState('Ship the live demo before the timer hits zero.')
  const [workCategory, setWorkCategory] = useState<WorkCategory>('General / Other')
  const [totalStreamMs, setTotalStreamMs] = useState(0)
  const [screenOnlyStreamMs, setScreenOnlyStreamMs] = useState(0)
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamHasCamera, setStreamHasCamera] = useState(true)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [sessionSyncError, setSessionSyncError] = useState<string | null>(null)
  const [viewerSessionId, setViewerSessionId] = useState<string | null>(null)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [currentHealth, setCurrentHealth] = useState(100)
  const [kickSignal, setKickSignal] = useState(0)
  const [isWasted, setIsWasted] = useState(false)
  const [isLobbyMode, setIsLobbyMode] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [clerkUserId, setClerkUserId] = useState<string | null>(null)
  const [myProfileId, setMyProfileId] = useState<string | null>(null)
  const [tokenBalances, setTokenBalances] = useState<TokenBalances | null>(null)
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [glitchUntil, setGlitchUntil] = useState<string | null>(null)
  const [shieldUntilIso, setShieldUntilIso] = useState<string | null>(null)
  const [streamerProfileId, setStreamerProfileId] = useState<string | null>(null)
  const [shieldUiMessage, setShieldUiMessage] = useState<string | null>(null)
  const [glitchActive, setGlitchActive] = useState(false)
  const [shieldActive, setShieldActive] = useState(false)
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0)
  const clerkConfigured = Boolean(getPublicEnv('VITE_CLERK_PUBLISHABLE_KEY'))
  const hasEndpoint = Boolean(getPublicEnv('VITE_LIVEKIT_URL'))
  const hasTokenFlow = Boolean(
    getPublicEnv('VITE_LIVEKIT_TOKEN_ENDPOINT') || getPublicEnv('VITE_LIVEKIT_TOKEN'),
  )
  const staticTokenSingleHost = Boolean(
    getPublicEnv('VITE_LIVEKIT_TOKEN') && !getPublicEnv('VITE_LIVEKIT_TOKEN_ENDPOINT'),
  )
  const liveKitRoomHintNeeded = liveKitStaticTokenNeedsRoomHint()
  const handleLiveChange = useCallback((isLive: boolean, hasCamera: boolean) => {
    setIsStreaming(isLive)
    setStreamHasCamera(hasCamera)
  }, [])

  const handleIdleKick = useCallback(() => {
    setCurrentHealth(0)
  }, [])

  const refreshTokens = useCallback(async () => {
    if (!clerkUserId) {
      setTokenBalances(null)
      return
    }
    try {
      setTokenError(null)
      const next = await fetchTokenBalances(clerkUserId)
      setTokenBalances(next)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Token load failed.'
      setTokenError(message)
    }
  }, [clerkUserId])

  useEffect(() => {
    queueMicrotask(() => {
      void refreshTokens()
    })
  }, [refreshTokens])

  useEffect(() => {
    if (!clerkUserId) {
      queueMicrotask(() => setMyProfileId(null))
      return
    }
    void fetchProfileIdForClerk(clerkUserId).then(setMyProfileId)
  }, [clerkUserId])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      setGlitchActive(Boolean(glitchUntil && new Date(glitchUntil).getTime() > now))
      setShieldActive(Boolean(shieldUntilIso && new Date(shieldUntilIso).getTime() > now))
    }
    tick()
    const timer = window.setInterval(tick, 900)
    return () => window.clearInterval(timer)
  }, [glitchUntil, shieldUntilIso])

  const displayCooldownMs = cooldownUntil ? cooldownRemainingMs : 0
  const cooldownRemainingMinutes = Math.ceil(displayCooldownMs / 60000)
  const isLoggedIn = loginMode === 'account' && Boolean(accountId.trim())
  const messagingHandle = isLoggedIn ? slugify(accountId) : ''
  const streamerHandle = slugify(isLoggedIn ? accountId : userId)
  const xp = Math.floor(totalStreamMs / HOUR_MS)
  const cameraStreamMs = Math.max(0, totalStreamMs - screenOnlyStreamMs)
  const kickBucks = Math.floor(cameraStreamMs / HOUR_MS) + Math.floor(screenOnlyStreamMs / SCREEN_ONLY_CREDIT_MS)
  const profileKey = useMemo(
    () => (loginMode === 'account' && accountId ? `acct:${slugify(accountId)}` : `guest:${getGuestId()}`),
    [accountId, loginMode],
  )
  const accountLoaded = loginMode === 'account' && Boolean(accountId.trim())
  const loginStatusClass = !accountLoaded
    ? loginMode === 'guest'
      ? 'login-status login-status--guest'
      : 'login-status login-status--account-pending'
    : 'login-status login-status--account-live'
  const loginStatusText = !accountLoaded
    ? loginMode === 'guest'
      ? 'SESSION: GUEST — no account name on this device. Pick Account below and Load Account to keep one profile, sync leaderboard handle, and unlock streamer messages.'
      : 'SESSION: ACCOUNT (not loaded) — type your account ID and click Load Account. There is no email/password yet; the ID is just a label stored in this browser.'
    : `SESSION: ACCOUNT — loaded as "${accountId.trim()}". Leaderboard + Supabase session use handle "${streamerHandle}". Messages use "${messagingHandle}".`

  useEffect(() => {
    const profiles = readProfiles()
    const existing = profiles[profileKey]
    const hydrate = () => {
      if (existing) {
        setDisplayName(existing.displayName)
        setTaskOfHour(existing.quest)
        setWorkCategory(normalizeWorkCategory(existing.workCategory ?? 'General / Other'))
        setTotalStreamMs(existing.totalStreamMs)
        setScreenOnlyStreamMs(existing.screenOnlyStreamMs ?? 0)
        setUserId(slugify(existing.displayName || existing.quest || accountId || 'operator-001'))
        return
      }
      const nextDisplayName =
        loginMode === 'account' && accountId ? accountId.trim() || 'Returning Streamer' : 'Guest Streamer'
      setDisplayName(nextDisplayName)
      setTaskOfHour('Ship the live demo before the timer hits zero.')
      setWorkCategory('General / Other')
      setTotalStreamMs(0)
      setScreenOnlyStreamMs(0)
      setUserId(slugify(nextDisplayName))
    }
    queueMicrotask(hydrate)
  }, [accountId, loginMode, profileKey])

  useEffect(() => {
    const profiles = readProfiles()
    profiles[profileKey] = {
      displayName,
      quest: taskOfHour,
      workCategory,
      totalStreamMs,
      screenOnlyStreamMs,
    }
    writeProfiles(profiles)
  }, [displayName, profileKey, screenOnlyStreamMs, taskOfHour, totalStreamMs, workCategory])

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
      const unsubscribe = subscribeToSessionHud(activeSessionId, (snap) => {
        setCurrentHealth(snap.currentHealth)
        setGlitchUntil(snap.glitchUntilIso)
      })
      return unsubscribe
    } catch {
      return
    }
  }, [activeSessionId, viewerSessionId])

  useEffect(() => {
    if (!activeSessionId || viewerSessionId) {
      queueMicrotask(() => setStreamerProfileId(null))
      return
    }
    const db = publicDb()
    if (!db) return
    void db
      .from('sessions')
      .select('user_id')
      .eq('id', activeSessionId)
      .maybeSingle()
      .then(({ data }) => {
        setStreamerProfileId((data?.user_id as string | undefined) ?? null)
      })
  }, [activeSessionId, viewerSessionId])

  useEffect(() => {
    if (!streamerProfileId || viewerSessionId) return
    return subscribeToProfileShield(streamerProfileId, (iso) => {
      setShieldUntilIso(iso)
    })
  }, [streamerProfileId, viewerSessionId])

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

  useEffect(() => {
    if (!isStreaming || viewerSessionId) return
    const timer = window.setInterval(() => {
      setTotalStreamMs((prevTotal) => prevTotal + 60_000)
      if (!streamHasCamera) {
        setScreenOnlyStreamMs((prevScreenOnly) => prevScreenOnly + 60_000)
      }
    }, 60_000)
    return () => window.clearInterval(timer)
  }, [isStreaming, streamHasCamera, viewerSessionId])

  useEffect(() => {
    if (viewerSessionId) return
    const db = publicDb()
    if (!db) return
    let cancelled = false

    const startSession = async () => {
      if (!isStreaming || activeSessionId) return
      const { data, error } = await db.rpc('start_stream_session', {
        p_username: streamerHandle,
        p_task_description: taskOfHour,
        p_work_category: workCategory,
      })
      if (cancelled) return
      if (error) {
        setSessionSyncError(`Session start failed: ${error.message}`)
        return
      }
      if (typeof data === 'string') {
        setActiveSessionId(data)
        setSessionSyncError(null)
      }
    }

    const updateSession = async () => {
      if (!isStreaming || !activeSessionId) return
      const { error } = await db.rpc('update_stream_session', {
        p_session_id: activeSessionId,
        p_task_description: taskOfHour,
        p_work_category: workCategory,
      })
      if (cancelled) return
      if (error) {
        setSessionSyncError(`Session update failed: ${error.message}`)
        return
      }
      setSessionSyncError(null)
    }

    const stopSession = async () => {
      if (isStreaming || !activeSessionId) return
      const stoppedSessionId = activeSessionId
      const { error } = await db.rpc('stop_stream_session', {
        p_session_id: stoppedSessionId,
      })
      if (cancelled) return
      if (error) {
        setSessionSyncError(`Session stop failed: ${error.message}`)
        return
      }
      setActiveSessionId(null)
      setSessionSyncError(null)
    }

    if (isStreaming && !activeSessionId) {
      void startSession()
      return () => {
        cancelled = true
      }
    }
    if (isStreaming && activeSessionId) {
      void updateSession()
      return () => {
        cancelled = true
      }
    }
    void stopSession()
    return () => {
      cancelled = true
    }
  }, [activeSessionId, isStreaming, streamerHandle, taskOfHour, viewerSessionId, workCategory])

  return (
    <main className="app">
      <section className="panel panel--hero">
        <p className="eyebrow">SHIP OR KICK // STREAMER OPS</p>
        <h1 className="title">Streamer Dashboard</h1>
        <p className="subtitle">Stream your screen & camera to earn kick bucks.</p>
        <p>
          Use the multiplexer below to arm simultaneous screen + camera capture and kick users who are not working.
        </p>
        <p className="eyebrow hero__login-cue">
          LOGIN: use the Identity card — Guest streams immediately; Account + Load Account keeps your stats on this
          device (not Google or email login).
        </p>
        <details className="help-panel">
          <summary className="help-panel__toggle" title="Open for full rules: kicks, vouches, and guest vs account.">
            Quick rules
          </summary>
          <div className="help-panel__body">
            <p>
              Kick rules: one kick vote per viewer each hour, and it takes 3 different viewers to trigger a kick.
            </p>
            <p>
              Vouch means positive support from viewers. It is currently a trust signal shown on the leaderboard.
            </p>
            <p>
              Guest mode lets anyone stream quickly. Account mode lets returning users keep XP, kick bucks, and quest text on this device.
            </p>
            <p>
              There is no separate sign-in screen. Choose Account in Identity, enter an ID (for example your stream
              name), then click Load Account.
            </p>
          </div>
        </details>
        {isLobbyMode && displayCooldownMs > 0 ? (
          <p className="error">
            PROCRASTINATION COOLDOWN ACTIVE: {cooldownRemainingMinutes} minute(s) remaining.
          </p>
        ) : null}
        {staticTokenSingleHost ? (
          <p className="error">
            Static LiveKit token mode supports one active host identity at a time. A second host may disconnect the
            first. Use a token endpoint for multi-user hosting.
          </p>
        ) : null}
        {viewerError ? <p className="error">Viewer mode error: {viewerError}</p> : null}
        {sessionSyncError ? <p className="error">{sessionSyncError}</p> : null}
        {clerkConfigured ? (
          <ClerkAuthBar streamerHandle={streamerHandle} onUserId={setClerkUserId} />
        ) : (
          <p className="eyebrow">
            Optional Clerk: set VITE_CLERK_PUBLISHABLE_KEY (or runtime-config) to enable sign-in and token wallet on the
            leaderboard.
          </p>
        )}
        {clerkUserId && tokenBalances ? (
          <p className="token-balance-strip">
            TOKENS — Kick: {tokenBalances.kickTokens} · Shield: {tokenBalances.blockKickTokens} · Vouch power:{' '}
            {tokenBalances.vouchPowerTokens}
          </p>
        ) : null}
        {tokenError ? <p className="error">{tokenError}</p> : null}
        {clerkUserId ? (
          <div className="stack">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                setShieldUiMessage(null)
                void (async () => {
                  try {
                    await activateDeepWorkShield(clerkUserId)
                    setShieldUiMessage('Deep work shield extended (+60 minutes).')
                    await refreshTokens()
                  } catch (error) {
                    const message = error instanceof Error ? error.message : 'Shield failed.'
                    setShieldUiMessage(message)
                  }
                })()
              }}
            >
              DEEP WORK SHIELD (+60m, costs 1 shield token)
            </button>
            {shieldUiMessage ? <p>{shieldUiMessage}</p> : null}
          </div>
        ) : null}
      </section>
      {!viewerSessionId ? (
        <GlobalLeaderboard
          clerkUserId={clerkUserId}
          myProfileId={myProfileId}
          onTokenEconomyChanged={() => void refreshTokens()}
        />
      ) : null}

      <section className="grid">
        <article className="panel">
          <h2 className="panel__title">Identity / Login</h2>
          <p className={loginStatusClass}>{loginStatusText}</p>
          <div className="stack">
            <label htmlFor="loginMode">Mode</label>
            <select id="loginMode" className="select" value={loginMode} onChange={(e) => setLoginMode(e.target.value as LoginMode)}>
              <option value="guest">Guest (no account)</option>
              <option value="account">Account (returning)</option>
            </select>
            {loginMode === 'account' ? (
              <>
                <label htmlFor="accountId">Account ID (then Load Account)</label>
                <input
                  id="accountId"
                  className="select"
                  value={accountIdDraft}
                  onChange={(e) => setAccountIdDraft(e.target.value)}
                  placeholder="your-name"
                />
                <button type="button" className="btn" onClick={() => setAccountId(accountIdDraft)}>
                  Load Account
                </button>
              </>
            ) : (
              <p>Streaming as guest. Progress is local to this browser.</p>
            )}
            <label htmlFor="displayName">Display Name</label>
            <input
              id="displayName"
              className="select"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
            <label htmlFor="quest">Current Quest</label>
            <input
              id="quest"
              className="select"
              value={taskOfHour}
              onChange={(event) => setTaskOfHour(event.target.value)}
              placeholder="What are you shipping right now?"
            />
            <label htmlFor="workCategory">Work Category</label>
            <select
              id="workCategory"
              className="select"
              value={workCategory}
              onChange={(event) => setWorkCategory(normalizeWorkCategory(event.target.value))}
            >
              {WORK_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
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
            <p className="field-section-label">Connection status</p>
            <p>Logged in as: {displayName || 'UNKNOWN'}</p>
            <p>Endpoint: {hasEndpoint ? 'READY' : 'Missing LiveKit URL'}</p>
            <p>Token flow: {hasTokenFlow ? 'READY' : 'Missing token (add JWT or token endpoint)'}</p>
            {liveKitRoomHintNeeded ? (
              <p className="error">
                Static LiveKit token in use without VITE_LIVEKIT_ROOM. Set VITE_LIVEKIT_ROOM to the same room name
                baked into that JWT (build env or /runtime-config.json), or switch to VITE_LIVEKIT_TOKEN_ENDPOINT.
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
              onLiveChange={handleLiveChange}
              onIdleKick={handleIdleKick}
            />
          )}
        </article>
        {!viewerSessionId ? (
          <StreamerMessages
            isLoggedIn={isLoggedIn}
            currentHandle={messagingHandle}
            currentDisplayName={displayName}
            xp={xp}
          />
        ) : null}
      </section>
      {!viewerSessionId ? (
        <StreamerHUD
          taskOfHour={taskOfHour}
          currentHealth={currentHealth}
          xp={xp}
          xpToNextLevel={500}
          kickBucks={kickBucks}
          playerName={displayName}
          shieldActive={shieldActive}
          glitchActive={glitchActive}
        />
      ) : null}
      <WastedOverlay visible={isWasted} />
    </main>
  )
}

export default App
