import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bounty } from './components/Bounty'
import { ClerkAuthBar } from './components/ClerkAuthBar'
import { FoulButton } from './components/FoulButton'
import { GlobalLeaderboard } from './components/GlobalLeaderboard'
import { LeaderboardView } from './components/LeaderboardView'
import { StreamerMessages } from './components/StreamerMessages'
import { StreamerHUD } from './components/StreamerHUD'
import { StreamMultiplexer } from './components/StreamMultiplexer'
import { ViewerStage } from './components/ViewerStage'
import { WastedOverlay } from './components/WastedOverlay'
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

type Tab = 'arena' | 'leaderboard' | 'how-it-works'
type LoginMode = 'guest' | 'account'

interface UserProfile {
  displayName: string
  quest: string
  workCategory?: WorkCategory
  totalStreamMs: number
  screenOnlyStreamMs?: number
}

const COOLDOWN_MS = 5 * 60 * 1000
const COOLDOWN_STORAGE_KEY = 'shiporkick.procrastination-cooldown-until'
const PROFILE_STORE_KEY = 'shiporkick.user-profiles'
const GUEST_ID_KEY = 'shiporkick.guest-id'
const HOUR_MS = 60 * 60 * 1000
const SCREEN_ONLY_CREDIT_MS = 3 * HOUR_MS

const HOW_IT_WORKS = [
  { icon: '📡', title: 'Go Live', desc: 'Share your screen + camera. One button. You\'re in the arena.' },
  { icon: '⚡', title: 'Earn Tokens', desc: '1 token per hour streamed. Stay consistent, stack tokens.' },
  { icon: '👢', title: 'Vote to Kick', desc: 'See someone slacking? 3 votes from different people ends their session.' },
  { icon: '🎧', title: 'The Headphone System', desc: 'Vote 1 knocks off one ear cup. Vote 2 takes the other. Vote 3 shatters the band. Then — KICKED.' },
  { icon: '🛡️', title: 'Block Tokens', desc: 'Spend tokens to block incoming kicks. Activate Deep Work mode.' },
  { icon: '🔥', title: 'Streaks', desc: 'Your streak is hours of consecutive shipping. The leaderboard is forever.' },
]

function slugify(input: string) {
  const t = input.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return t || 'operator-001'
}

function getGuestId() {
  const e = window.localStorage.getItem(GUEST_ID_KEY)
  if (e) return e
  const g = `guest-${Math.random().toString(36).slice(2, 8)}`
  window.localStorage.setItem(GUEST_ID_KEY, g)
  return g
}

function readProfiles(): Record<string, UserProfile> {
  try { return JSON.parse(window.localStorage.getItem(PROFILE_STORE_KEY) ?? '{}') as Record<string, UserProfile> }
  catch { return {} }
}

function writeProfiles(profiles: Record<string, UserProfile>) {
  window.localStorage.setItem(PROFILE_STORE_KEY, JSON.stringify(profiles))
}

function App() {
  const { connectAsViewer } = useStreaming()

  const [activeTab, setActiveTab] = useState<Tab>('arena')
  const [showGoLive, setShowGoLive] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  const [loginMode, setLoginMode] = useState<LoginMode>('guest')
  const [accountIdDraft, setAccountIdDraft] = useState('')
  const [accountId, setAccountId] = useState('')
  const [userId, setUserId] = useState('operator-001')
  const [displayName, setDisplayName] = useState('Guest Streamer')
  const [taskOfHour, setTaskOfHour] = useState('Shipping something great.')
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
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0)

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

  const clerkConfigured = Boolean(getPublicEnv('VITE_CLERK_PUBLISHABLE_KEY'))
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

  const handleLiveChange = useCallback((isLive: boolean, hasCamera: boolean) => {
    setIsStreaming(isLive)
    setStreamHasCamera(hasCamera)
    if (isLive) setShowGoLive(false)
  }, [])

  const handleIdleKick = useCallback(() => setCurrentHealth(0), [])

  const refreshTokens = useCallback(async () => {
    if (!clerkUserId) { setTokenBalances(null); return }
    try {
      setTokenError(null)
      setTokenBalances(await fetchTokenBalances(clerkUserId))
    } catch (e) {
      setTokenError(e instanceof Error ? e.message : 'Token load failed.')
    }
  }, [clerkUserId])

  useEffect(() => { queueMicrotask(() => { void refreshTokens() }) }, [refreshTokens])

  useEffect(() => {
    if (!clerkUserId) { queueMicrotask(() => setMyProfileId(null)); return }
    void fetchProfileIdForClerk(clerkUserId).then(setMyProfileId)
  }, [clerkUserId])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()
      setGlitchActive(Boolean(glitchUntil && new Date(glitchUntil).getTime() > now))
      setShieldActive(Boolean(shieldUntilIso && new Date(shieldUntilIso).getTime() > now))
    }
    tick()
    const t = window.setInterval(tick, 900)
    return () => window.clearInterval(t)
  }, [glitchUntil, shieldUntilIso])

  useEffect(() => {
    const profiles = readProfiles()
    const existing = profiles[profileKey]
    queueMicrotask(() => {
      if (existing) {
        setDisplayName(existing.displayName)
        setTaskOfHour(existing.quest)
        setWorkCategory(normalizeWorkCategory(existing.workCategory ?? 'General / Other'))
        setTotalStreamMs(existing.totalStreamMs)
        setScreenOnlyStreamMs(existing.screenOnlyStreamMs ?? 0)
        setUserId(slugify(existing.displayName || existing.quest || accountId || 'operator-001'))
      } else {
        const n = loginMode === 'account' && accountId ? accountId.trim() || 'Returning Streamer' : 'Guest Streamer'
        setDisplayName(n)
        setTaskOfHour('Shipping something great.')
        setWorkCategory('General / Other')
        setTotalStreamMs(0)
        setScreenOnlyStreamMs(0)
        setUserId(slugify(n))
      }
    })
  }, [accountId, loginMode, profileKey])

  useEffect(() => {
    const profiles = readProfiles()
    profiles[profileKey] = { displayName, quest: taskOfHour, workCategory, totalStreamMs, screenOnlyStreamMs }
    writeProfiles(profiles)
  }, [displayName, profileKey, screenOnlyStreamMs, taskOfHour, totalStreamMs, workCategory])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mode = params.get('mode')
    const room = params.get('room')
    const session = params.get('session')
    const storedCooldown = Number(window.localStorage.getItem(COOLDOWN_STORAGE_KEY) ?? '')
    const parsedCooldown = Number(params.get('cooldown_until') ?? '')
    const nextCooldown = Number.isFinite(parsedCooldown) && parsedCooldown > 0 ? parsedCooldown : storedCooldown

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
        try { await connectAsViewer(room) }
        catch (e) { setViewerError(e instanceof Error ? e.message : 'Viewer join failed.') }
      })()
    })
  }, [connectAsViewer])

  useEffect(() => {
    if (viewerSessionId || !activeSessionId) return
    try {
      return subscribeToSessionHud(activeSessionId, (snap) => {
        setCurrentHealth(snap.currentHealth)
        setGlitchUntil(snap.glitchUntilIso)
      })
    } catch { return }
  }, [activeSessionId, viewerSessionId])

  useEffect(() => {
    if (!activeSessionId || viewerSessionId) { queueMicrotask(() => setStreamerProfileId(null)); return }
    const db = publicDb()
    if (!db) return
    void db.from('sessions').select('user_id').eq('id', activeSessionId).maybeSingle().then(({ data }) => {
      setStreamerProfileId((data?.user_id as string | undefined) ?? null)
    })
  }, [activeSessionId, viewerSessionId])

  useEffect(() => {
    if (!streamerProfileId || viewerSessionId) return
    return subscribeToProfileShield(streamerProfileId, (iso) => setShieldUntilIso(iso))
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
    const t = window.setInterval(tick, 1000)
    return () => { window.clearTimeout(first); window.clearInterval(t) }
  }, [cooldownUntil])

  useEffect(() => {
    if (viewerSessionId || currentHealth > 0 || isWasted) return
    setIsWasted(true)
    setKickSignal((p) => p + 1)
    const until = Date.now() + COOLDOWN_MS
    window.localStorage.setItem(COOLDOWN_STORAGE_KEY, String(until))
    window.setTimeout(() => {
      const url = new URL(window.location.href)
      url.search = ''
      url.searchParams.set('mode', 'lobby')
      url.searchParams.set('cooldown_until', String(until))
      window.location.href = url.toString()
    }, 2400)
  }, [currentHealth, isWasted, viewerSessionId])

  useEffect(() => {
    if (!isStreaming || viewerSessionId) return
    const t = window.setInterval(() => {
      setTotalStreamMs((p) => p + 60_000)
      if (!streamHasCamera) setScreenOnlyStreamMs((p) => p + 60_000)
    }, 60_000)
    return () => window.clearInterval(t)
  }, [isStreaming, streamHasCamera, viewerSessionId])

  // Heartbeat — keeps leaderboard row alive
  useEffect(() => {
    if (!isStreaming || !activeSessionId || viewerSessionId) return
    const db = publicDb()
    if (!db) return
    const beat = async () => { try { await db.rpc('heartbeat_session', { p_session_id: activeSessionId }) } catch { /* ignore */ } }
    beat()
    const t = window.setInterval(beat, 60_000)
    return () => window.clearInterval(t)
  }, [isStreaming, activeSessionId, viewerSessionId])

  useEffect(() => {
    if (viewerSessionId) return
    const db = publicDb()
    if (!db) return
    let cancelled = false

    if (isStreaming && !activeSessionId) {
      void (async () => {
        const { data, error } = await db.rpc('start_stream_session', {
          p_username: streamerHandle, p_task_description: taskOfHour, p_work_category: workCategory,
        })
        if (cancelled) return
        if (error) { setSessionSyncError(`Session start failed: ${error.message}`); return }
        if (typeof data === 'string') { setActiveSessionId(data); setSessionSyncError(null) }
      })()
      return () => { cancelled = true }
    }

    if (isStreaming && activeSessionId) {
      void (async () => {
        const { error } = await db.rpc('update_stream_session', {
          p_session_id: activeSessionId, p_task_description: taskOfHour, p_work_category: workCategory,
        })
        if (cancelled) return
        if (error) { setSessionSyncError(`Session update failed: ${error.message}`); return }
        setSessionSyncError(null)
      })()
      return () => { cancelled = true }
    }

    if (!isStreaming && activeSessionId) {
      const stopping = activeSessionId
      void (async () => {
        const { error } = await db.rpc('stop_stream_session', { p_session_id: stopping })
        if (cancelled) return
        if (error) { setSessionSyncError(`Session stop failed: ${error.message}`); return }
        setActiveSessionId(null)
        setSessionSyncError(null)
      })()
      return () => { cancelled = true }
    }
  }, [activeSessionId, isStreaming, streamerHandle, taskOfHour, viewerSessionId, workCategory])

  const initials = (displayName || '?').slice(0, 2).toUpperCase()

  return (
    <div className="app-shell">
      <WastedOverlay visible={isWasted} />

      {/* ── Sticky header ── */}
      <header className="site-header">
        <div className="site-header__brand">
          <span className="site-header__logo">SHIP OR KICK</span>
          <div className="live-pulse">
            <div className="live-pulse__dot" />
            <span className="live-pulse__label">LIVE</span>
          </div>
        </div>

        <nav className="tab-nav">
          {(['arena', 'leaderboard', 'how-it-works'] as Tab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`tab-nav__item${activeTab === tab ? ' tab-nav__item--active' : ''}`}
            >
              {tab === 'how-it-works' ? 'HOW IT WORKS' : tab.toUpperCase()}
            </button>
          ))}
        </nav>

        <div className="site-header__actions">
          {tokenBalances && (
            <span className="site-header__tokens">⚡ {tokenBalances.kickTokens}</span>
          )}
          {isStreaming ? (
            <span className="site-header__live-badge">● LIVE</span>
          ) : !viewerSessionId ? (
            <button type="button" className="btn btn--primary" onClick={() => setShowGoLive(true)}>
              GO LIVE
            </button>
          ) : null}
          <button type="button" className="site-header__profile-btn" onClick={() => setShowProfile(true)} title={displayName}>
            {initials}
          </button>
        </div>
      </header>

      {/* ── Tab content ── */}
      <div className="tab-page">

        {/* ARENA */}
        {activeTab === 'arena' && (
          viewerSessionId ? (
            <div className="stack">
              <ViewerStage />
              <FoulButton sessionId={viewerSessionId} />
              <Bounty sessionId={viewerSessionId} />
              {viewerError && <p className="error">{viewerError}</p>}
            </div>
          ) : (
            <div>
              <div className="arena-header">
                <div>
                  <h1 className="arena-title">The Arena</h1>
                  <p className="arena-subtitle">Active shippers · 3 votes to kick</p>
                </div>
              </div>
              {isLobbyMode && displayCooldownMs > 0 && (
                <p className="error" style={{ marginBottom: 12 }}>COOLDOWN: {cooldownRemainingMinutes}m remaining</p>
              )}
              {sessionSyncError && <p className="error" style={{ marginBottom: 12 }}>{sessionSyncError}</p>}
              <GlobalLeaderboard
                clerkUserId={clerkUserId}
                myProfileId={myProfileId}
                onTokenEconomyChanged={() => void refreshTokens()}
              />
            </div>
          )
        )}

        {/* LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <LeaderboardView clerkUserId={clerkUserId} myProfileId={myProfileId} />
        )}

        {/* HOW IT WORKS */}
        {activeTab === 'how-it-works' && (
          <div>
            <h1 className="arena-title" style={{ marginBottom: 6 }}>How It Works</h1>
            <p className="arena-subtitle" style={{ marginBottom: 24 }}>The rules of the arena</p>
            <div className="stack">
              {HOW_IT_WORKS.map((item) => (
                <div key={item.title} className="how-card">
                  <span className="how-card__icon">{item.icon}</span>
                  <div>
                    <div className="how-card__title">{item.title}</div>
                    <div className="how-card__desc">{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── GO LIVE modal ── */}
      {showGoLive && (
        <div className="modal-overlay" onClick={() => setShowGoLive(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-box__header">
              <span className="modal-box__title">GO LIVE</span>
              <button type="button" className="modal-box__close" onClick={() => setShowGoLive(false)}>✕</button>
            </div>

            <div className="stack">
              <div>
                <div className="modal-section-label">IDENTITY</div>
                <div className="stack" style={{ marginTop: 8 }}>
                  <select className="select" value={loginMode} onChange={(e) => setLoginMode(e.target.value as LoginMode)}>
                    <option value="guest">Guest (quick start)</option>
                    <option value="account">Account (saves your stats)</option>
                  </select>
                  {loginMode === 'account' && (
                    <>
                      <input
                        className="select"
                        value={accountIdDraft}
                        onChange={(e) => setAccountIdDraft(e.target.value)}
                        placeholder="your-handle  (e.g. gozer)"
                      />
                      <button type="button" className="btn btn--primary" onClick={() => setAccountId(accountIdDraft)}>
                        LOAD ACCOUNT
                      </button>
                      {accountId && (
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)' }}>
                          Loaded: @{slugify(accountId)}
                        </p>
                      )}
                    </>
                  )}
                  <input
                    className="select"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Display name"
                  />
                  <input
                    className="select"
                    value={taskOfHour}
                    onChange={(e) => setTaskOfHour(e.target.value)}
                    placeholder="What are you shipping right now?"
                  />
                  <select className="select" value={workCategory} onChange={(e) => setWorkCategory(normalizeWorkCategory(e.target.value))}>
                    {WORK_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>

              {clerkConfigured && (
                <ClerkAuthBar streamerHandle={streamerHandle} onUserId={setClerkUserId} />
              )}

              <div>
                <div className="modal-section-label">STREAM</div>
                <div style={{ marginTop: 8 }}>
                  <StreamMultiplexer
                    userId={userId}
                    disabled={isLobbyMode && displayCooldownMs > 0}
                    kickSignal={kickSignal}
                    onLiveChange={handleLiveChange}
                    onIdleKick={handleIdleKick}
                  />
                </div>
              </div>

              {isLoggedIn && (
                <div>
                  <div className="modal-section-label">MESSAGES</div>
                  <div style={{ marginTop: 8 }}>
                    <StreamerMessages
                      isLoggedIn={isLoggedIn}
                      currentHandle={messagingHandle}
                      currentDisplayName={displayName}
                      xp={xp}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── PROFILE modal ── */}
      {showProfile && (
        <div className="modal-overlay" onClick={() => setShowProfile(false)}>
          <div className="modal-box modal-box--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-box__header">
              <span className="modal-box__title">PROFILE</span>
              <button type="button" className="modal-box__close" onClick={() => setShowProfile(false)}>✕</button>
            </div>

            <div className="stack">
              <div className="profile-avatar">{initials}</div>
              <div className="profile-name">{displayName}</div>
              <div className="profile-handle">@{streamerHandle}</div>

              <div className="profile-stat-grid">
                <div className="profile-stat">
                  <div className="profile-stat__label">XP</div>
                  <div className="profile-stat__value">{xp}</div>
                </div>
                <div className="profile-stat">
                  <div className="profile-stat__label">KB</div>
                  <div className="profile-stat__value">{kickBucks}</div>
                </div>
                <div className="profile-stat">
                  <div className="profile-stat__label">HRS</div>
                  <div className="profile-stat__value">{Math.floor(totalStreamMs / HOUR_MS)}</div>
                </div>
                {tokenBalances && (
                  <>
                    <div className="profile-stat">
                      <div className="profile-stat__label">KICK</div>
                      <div className="profile-stat__value" style={{ color: 'var(--danger)' }}>{tokenBalances.kickTokens}</div>
                    </div>
                    <div className="profile-stat">
                      <div className="profile-stat__label">SHIELD</div>
                      <div className="profile-stat__value" style={{ color: 'var(--gold)' }}>{tokenBalances.blockKickTokens}</div>
                    </div>
                    <div className="profile-stat">
                      <div className="profile-stat__label">VOUCH</div>
                      <div className="profile-stat__value" style={{ color: 'var(--green)' }}>{tokenBalances.vouchPowerTokens}</div>
                    </div>
                  </>
                )}
              </div>

              {loginMode === 'guest' && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
                  Switch to Account mode in GO LIVE to keep your stats across sessions
                </p>
              )}

              {clerkConfigured && !clerkUserId && (
                <ClerkAuthBar streamerHandle={streamerHandle} onUserId={setClerkUserId} />
              )}

              {clerkUserId && tokenBalances && (
                <>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => {
                      setShieldUiMessage(null)
                      void (async () => {
                        try {
                          await activateDeepWorkShield(clerkUserId)
                          setShieldUiMessage('🛡 Shield extended +60 minutes.')
                          await refreshTokens()
                        } catch (e) {
                          setShieldUiMessage(e instanceof Error ? e.message : 'Shield failed.')
                        }
                      })()
                    }}
                  >
                    🛡 DEEP WORK SHIELD ({tokenBalances.blockKickTokens} tokens)
                  </button>
                  {shieldUiMessage && <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>{shieldUiMessage}</p>}
                </>
              )}
              {tokenError && <p className="error">{tokenError}</p>}
            </div>
          </div>
        </div>
      )}

      {/* ── Bottom HUD ── */}
      {!viewerSessionId && (
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
      )}
    </div>
  )
}

export default App
