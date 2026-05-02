import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArenaWheel } from './components/ArenaWheel'
import { AuthModal } from './components/AuthModal'
import { Bounty } from './components/Bounty'
import { ClerkAuthBar } from './components/ClerkAuthBar'
import { FoulButton } from './components/FoulButton'
import { LeaderboardView } from './components/LeaderboardView'
import { PipMiniPlayer, isDocumentPipSupported } from './components/PipMiniPlayer'
import type { LeaderboardStreamer } from './lib/globalLeaderboardRealtime'
import { StreamerMessages } from './components/StreamerMessages'
import { StreamerHUD } from './components/StreamerHUD'
import { StreamMultiplexer } from './components/StreamMultiplexer'
import { ViewerStage } from './components/ViewerStage'
import { WastedOverlay } from './components/WastedOverlay'
import { resolveHostRoomName } from './lib/livekitRoom'
import { subscribeToProfileShield } from './lib/profileShieldRealtime'
import { publicDb } from './lib/publicSupabase'
import { getPublicEnv } from './lib/runtimeEnv'
import { getSupabase } from './lib/supabaseClient'
import { subscribeToSessionHud } from './lib/sessionHealthRealtime'
import {
  activateDeepWorkShield,
  fetchMyTokenBalance,
  fetchProfileIdForClerk,
  fetchTokenBalances,
  updateMyAvatar,
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
  { icon: '📡', title: 'Go Live', desc: 'Share your screen + camera. One button. You\'re working in front of everyone.' },
  { icon: '⚡', title: 'Earn Tokens', desc: '1 token per hour streamed. Stay consistent, stack tokens.' },
  { icon: '🎧', title: 'Vote to Jerk', desc: 'Catch someone slacking? 3 votes from different people pulls the plug on their session.' },
  { icon: '🔌', title: 'The Headphone System', desc: 'Vote 1 yanks one ear cup. Vote 2 takes the other. Vote 3 jerks the cable right out — JERKED.' },
  { icon: '🛡️', title: 'Block Tokens', desc: 'Spend tokens to block incoming jerks. Activate Deep Work mode.' },
  { icon: '🔥', title: 'Streaks', desc: 'Your streak is consecutive days of shipping. The leaderboard is forever.' },
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
  const [showAuth, setShowAuth] = useState(false)
  const [authEmail, setAuthEmail] = useState<string | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [usernameDraft, setUsernameDraft] = useState('')
  const [usernameSaveMsg, setUsernameSaveMsg] = useState<string | null>(null)
  const [usernameSaveBusy, setUsernameSaveBusy] = useState(false)
  const [needsUsername, setNeedsUsername] = useState(false)
  const [queuePosition, setQueuePosition] = useState<number | null>(null)
  const [queueActiveCount, setQueueActiveCount] = useState(0)
  const [myTokens, setMyTokens] = useState(0)
  const [myAvatar, setMyAvatar] = useState<string | null>(null)
  const [avatarSavingMsg, setAvatarSavingMsg] = useState<string | null>(null)
  const [pipStreamer, setPipStreamer] = useState<LeaderboardStreamer | null>(null)
  const [goLiveEverOpened, setGoLiveEverOpened] = useState(false)
  const [isGoLiveMinimized, setIsGoLiveMinimized] = useState(false)
  const [streamStartTime, setStreamStartTime] = useState<number | null>(null)

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
    if (isLive) setStreamStartTime(Date.now())
    else setStreamStartTime(null)
  }, [])

  const handleIdleKick = useCallback(() => setCurrentHealth(0), [])

  const refreshTokens = useCallback(async () => {
    setTokenError(null)
    if (clerkUserId) {
      try { setTokenBalances(await fetchTokenBalances(clerkUserId)) }
      catch (e) { setTokenError(e instanceof Error ? e.message : 'Token load failed.') }
    } else {
      setTokenBalances(null)
    }
    if (authUserId) {
      try { setMyTokens(await fetchMyTokenBalance()) }
      catch { /* ignore */ }
    } else {
      setMyTokens(0)
    }
  }, [clerkUserId, authUserId])

  useEffect(() => { queueMicrotask(() => { void refreshTokens() }) }, [refreshTokens])

  // Supabase Auth — track logged-in user (persists across page loads)
  useEffect(() => {
    const supa = getSupabase()
    if (!supa) return

    const linkProfile = async (user: { id: string; email?: string | null }) => {
      const db = publicDb()
      if (!db) return
      const { data: existing } = await db
        .from('profiles')
        .select('username, avatar_emoji')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (existing && (existing as { username?: string }).username) {
        const u = (existing as { username: string; avatar_emoji?: string | null }).username
        const av = (existing as { avatar_emoji?: string | null }).avatar_emoji ?? null
        setAccountId(u)
        setAccountIdDraft(u)
        setUsernameDraft(u)
        setMyAvatar(av)
        setNeedsUsername(false)
      } else {
        // Auto-create profile so the user immediately has 1 XP and 2 tokens
        // (server-side defaults via link_or_create_profile RPC + tokens DEFAULTs)
        const guess = (user.email ?? '').split('@')[0].replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'streamer'
        try {
          const { data: created } = await db.rpc('link_or_create_profile', { p_username: guess })
          const row = (Array.isArray(created) ? created[0] : created) as { username?: string; avatar_emoji?: string | null } | null
          const u = row?.username ?? guess
          setAccountId(u)
          setAccountIdDraft(u)
          setUsernameDraft(u)
          setMyAvatar(row?.avatar_emoji ?? null)
          setNeedsUsername(false)
        } catch {
          // Fallback: surface manual username chooser
          setUsernameDraft(guess)
          setAccountId(guess)
          setAccountIdDraft(guess)
          setNeedsUsername(true)
        }
      }
    }

    void supa.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      if (user) {
        setAuthUserId(user.id)
        setAuthEmail(user.email ?? null)
        void linkProfile(user)
      }
    })
    const { data: sub } = supa.auth.onAuthStateChange((_event, session) => {
      const user = session?.user
      setAuthUserId(user?.id ?? null)
      setAuthEmail(user?.email ?? null)
      if (user) {
        setLoginMode('account')
        void linkProfile(user)
        setShowProfile(true)
      } else {
        setNeedsUsername(false)
        setUsernameDraft('')
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const saveUsername = async () => {
    const supa = getSupabase()
    const db = publicDb()
    if (!supa || !db || !authUserId) return
    const u = usernameDraft.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    if (u.length < 3) { setUsernameSaveMsg('Username must be at least 3 chars (letters, numbers, _, -).'); return }
    setUsernameSaveBusy(true); setUsernameSaveMsg(null)
    try {
      const { data, error } = await db.rpc('link_or_create_profile', { p_username: u })
      if (error) {
        // Surface the real Postgrest error (PostgrestError has .message, .code, .hint, .details)
        const detail = [error.message, error.hint, error.details].filter(Boolean).join(' — ')
        throw new Error(detail || 'unknown error')
      }
      const row = (Array.isArray(data) ? data[0] : data) as { username?: string } | null
      const saved = row?.username ?? u
      setAccountId(saved)
      setAccountIdDraft(saved)
      setUsernameDraft(saved)
      setNeedsUsername(false)
      setUsernameSaveMsg('Saved.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setUsernameSaveMsg(/duplicate|taken|unique/i.test(msg) ? 'Username taken — try another.' : `Save failed: ${msg}`)
    } finally { setUsernameSaveBusy(false) }
  }

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

  // Queue polling — when user is queued, check position + active count every 5s.
  // Auto-retry start_stream_session when at top of queue and a slot opens.
  useEffect(() => {
    if (queuePosition === null) return
    const db = publicDb()
    if (!db) return
    let cancelled = false
    const tick = async () => {
      const { data, error } = await db.rpc('get_queue_status', { p_username: streamerHandle })
      if (cancelled || error) return
      const status = data as { in_queue: boolean; position: number | null; active: number; cap: number } | null
      if (!status) return
      setQueueActiveCount(status.active)
      if (!status.in_queue) {
        setQueuePosition(null)
        return
      }
      setQueuePosition(status.position ?? null)
      // If we're #1 and a slot is open, retry by re-flipping isStreaming.
      // The user already gave gesture permission for capture in this session, so we can republish.
      if (status.position === 1 && status.active < status.cap) {
        // Retry by re-triggering the session-start effect (no auto screen capture).
        // Surface "your turn" notice; user clicks again to re-share screen.
        setSessionSyncError('Your turn! Click GO LIVE to start.')
      }
    }
    void tick()
    const t = window.setInterval(tick, 5000)
    return () => { cancelled = true; window.clearInterval(t) }
  }, [queuePosition, streamerHandle])

  const leaveQueue = useCallback(async () => {
    const db = publicDb()
    if (!db) return
    await db.rpc('leave_queue', { p_username: streamerHandle })
    setQueuePosition(null)
  }, [streamerHandle])

  // Heartbeat — keeps leaderboard row alive
  useEffect(() => {
    if (!isStreaming || !activeSessionId || viewerSessionId) return
    const db = publicDb()
    if (!db) return
    const beat = async () => { try { await db.rpc('heartbeat_session', { p_session_id: activeSessionId }) } catch { /* ignore */ } }
    beat()
    const t = window.setInterval(beat, 30_000)
    return () => window.clearInterval(t)
  }, [isStreaming, activeSessionId, viewerSessionId])

  // Stop session on page unload — survives the unload via fetch keepalive
  useEffect(() => {
    if (!isStreaming || !activeSessionId || viewerSessionId) return

    const stopOnUnload = () => {
      const url = getPublicEnv('VITE_SUPABASE_URL')
      const anon = getPublicEnv('VITE_SUPABASE_ANON_KEY')
      if (!url || !anon || !activeSessionId) return
      try {
        fetch(`${url}/rest/v1/rpc/stop_stream_session`, {
          method: 'POST',
          headers: {
            apikey: anon,
            Authorization: `Bearer ${anon}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ p_session_id: activeSessionId }),
          keepalive: true,
        }).catch(() => {})
      } catch { /* ignore */ }
    }

    window.addEventListener('beforeunload', stopOnUnload)
    window.addEventListener('pagehide', stopOnUnload)
    return () => {
      window.removeEventListener('beforeunload', stopOnUnload)
      window.removeEventListener('pagehide', stopOnUnload)
    }
  }, [isStreaming, activeSessionId, viewerSessionId])

  useEffect(() => {
    if (viewerSessionId) return
    const db = publicDb()
    if (!db) return
    let cancelled = false

    if (isStreaming && !activeSessionId) {
      void (async () => {
        const { data, error } = await db.rpc('start_stream_session', {
          p_username: streamerHandle,
          p_task_description: taskOfHour,
          p_work_category: workCategory,
          p_livekit_room: resolveHostRoomName(userId),
        })
        if (cancelled) return
        if (error) {
          if (/STREAM_LIMIT_REACHED/.test(error.message)) {
            // 10 active streams reached — server already added us to the queue.
            // Stop the local stream and surface queue UI; we'll auto-retry when promoted.
            setSessionSyncError(null)
            setIsStreaming(false)
            setStreamStartTime(null)
            setQueuePosition(1) // optimistic; real value comes from polling
            return
          }
          setSessionSyncError(`Session start failed: ${error.message}`)
          return
        }
        if (typeof data === 'string') {
          setActiveSessionId(data)
          setSessionSyncError(null)
          setQueuePosition(null)
        }
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
  const AVATAR_OPTIONS = ['🦊', '🦅', '🐺', '🐉', '🦁', '🐻', '🔥', '⚡', '🚀', '💻', '🎯', '🌊', '🎮', '🦾', '👾', '🤖', '🎧', '🔌', '🌪️', '🧠']

  const handlePopOutWithLeaderboard = useCallback((s: LeaderboardStreamer) => {
    if (!isDocumentPipSupported()) return
    setPipStreamer(s)
  }, [])

  const saveAvatar = async (emoji: string) => {
    setAvatarSavingMsg(null)
    try {
      await updateMyAvatar(emoji)
      setMyAvatar(emoji)
      setAvatarSavingMsg('Saved.')
    } catch (e) {
      setAvatarSavingMsg(e instanceof Error ? e.message : 'Failed.')
    }
  }

  return (
    <div className="app-shell">
      <WastedOverlay visible={isWasted} />
      {pipStreamer && (
        <PipMiniPlayer streamer={pipStreamer} onClose={() => setPipStreamer(null)} />
      )}

      {/* ── Sticky header ── */}
      <header className="site-header">
        <div className="site-header__brand">
          <span className="site-header__logo">WORK OR JERK</span>
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
          {!authUserId && (
            <button type="button" className="btn btn-ghost" style={{ fontSize: '10px', padding: '4px 10px' }} onClick={() => setShowAuth(true)}>
              SIGN IN
            </button>
          )}
          {authUserId && (
            <span className="site-header__tokens" title="Tokens (jerk or vouch)">🪙 {myTokens}</span>
          )}
          {isStreaming ? (
            <button type="button" className="site-header__live-badge" style={{ cursor: 'pointer' }} onClick={() => { setIsGoLiveMinimized(false); setShowGoLive(true) }}>● LIVE</button>
          ) : queuePosition !== null ? (
            <button type="button" className="btn btn-ghost" style={{ fontSize: '10px' }} onClick={() => setShowGoLive(true)}>
              🕒 QUEUE #{queuePosition}
            </button>
          ) : !viewerSessionId ? (
            <button type="button" className="btn btn--primary" onClick={() => { setGoLiveEverOpened(true); setShowGoLive(true); setIsGoLiveMinimized(false) }}>
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
                  <h1 className="arena-title">Stream your work or be a <em style={{ color: 'var(--pink)', fontStyle: 'italic' }}>jerk</em></h1>
                  <p className="arena-subtitle">Active workers · 3 votes pull the plug</p>
                </div>
              </div>
              {isLobbyMode && displayCooldownMs > 0 && (
                <p className="error" style={{ marginBottom: 12 }}>COOLDOWN: {cooldownRemainingMinutes}m remaining</p>
              )}
              {sessionSyncError && <p className="error" style={{ marginBottom: 12 }}>{sessionSyncError}</p>}
              <ArenaWheel
                clerkUserId={clerkUserId}
                authUserId={authUserId}
                myProfileId={myProfileId}
                onTokenEconomyChanged={() => void refreshTokens()}
                onPopOutWithLeaderboard={handlePopOutWithLeaderboard}
              />
            </div>
          )
        )}

        {/* LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <LeaderboardView
            clerkUserId={clerkUserId}
            authUserId={authUserId}
            myProfileId={myProfileId}
            onTokenEconomyChanged={() => void refreshTokens()}
            onPopOutWithLeaderboard={handlePopOutWithLeaderboard}
          />
        )}

        {/* HOW IT WORKS */}
        {activeTab === 'how-it-works' && (
          <div>
            <h1 className="arena-title" style={{ marginBottom: 6 }}>How It Works</h1>
            <p className="arena-subtitle" style={{ marginBottom: 24 }}>Stream your work or get jerked</p>
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
      {/* GO LIVE modal — CSS display keeps StreamMultiplexer mounted while streaming */}
      {goLiveEverOpened && (
      <div style={{ display: (showGoLive || isStreaming) && !isGoLiveMinimized ? 'flex' : 'none', position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', zIndex: 200, alignItems: 'flex-start', justifyContent: 'center', padding: '24px 16px', overflowY: 'auto' }}
        onClick={() => { if (!isStreaming) setShowGoLive(false) }}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-box__header">
              {isStreaming ? (
                <span className="modal-box__title" style={{ color: 'var(--pink)' }}>● STREAMING LIVE</span>
              ) : (
                <span className="modal-box__title">GO LIVE</span>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                {isStreaming && (
                  <button type="button" className="btn btn-muted" style={{ fontSize: '10px', padding: '3px 10px' }} onClick={() => { setIsGoLiveMinimized(true); setShowGoLive(false) }}>
                    — MINIMIZE
                  </button>
                )}
                <button type="button" className="modal-box__close" onClick={() => setShowGoLive(false)}>✕</button>
              </div>
            </div>

            <div className="stack">
              {queuePosition !== null && !isStreaming && (
                <div style={{ background: 'var(--card2)', border: '1px solid var(--gold)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: 1 }}>
                    🕒 WAITING ROOM · POSITION #{queuePosition}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.6 }}>
                    {queueActiveCount}/10 streamers live. {queuePosition === 1
                      ? 'You\'re next — click START STREAM below the moment a slot opens.'
                      : `${queuePosition - 1} ahead of you. We\'ll auto-promote you when it\'s your turn.`}
                  </div>
                  <button type="button" className="btn btn-muted" style={{ fontSize: 10, alignSelf: 'flex-start' }} onClick={() => void leaveQueue()}>
                    LEAVE QUEUE
                  </button>
                </div>
              )}
              {!isStreaming && (
                <div>
                  <div className="modal-section-label">IDENTITY</div>
                  <div className="stack" style={{ marginTop: 8 }}>
                    <select className="select" value={loginMode} onChange={(e) => setLoginMode(e.target.value as LoginMode)}>
                      <option value="guest">Guest (quick start)</option>
                      <option value="account">Returning streamer — enter your handle</option>
                    </select>
                    {loginMode === 'account' && (
                      <>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <input
                            className="select"
                            style={{ flex: 1 }}
                            value={accountIdDraft}
                            onChange={(e) => setAccountIdDraft(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') setAccountId(accountIdDraft) }}
                            placeholder="your-handle  (e.g. gozer)"
                          />
                          <button type="button" className="btn btn--primary" onClick={() => setAccountId(accountIdDraft)}>
                            LOAD
                          </button>
                        </div>
                        {accountId && (
                          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)' }}>
                            ✓ Loaded: @{slugify(accountId)}
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
              )}

              {clerkConfigured && !isStreaming && (
                <ClerkAuthBar streamerHandle={streamerHandle} onUserId={setClerkUserId} />
              )}

              <div>
                {!isStreaming && <div className="modal-section-label">STREAM</div>}
                <div style={{ marginTop: isStreaming ? 0 : 8 }}>
                  <StreamMultiplexer
                    userId={userId}
                    disabled={isLobbyMode && displayCooldownMs > 0}
                    kickSignal={kickSignal}
                    onLiveChange={handleLiveChange}
                    onIdleKick={handleIdleKick}
                  />
                </div>
              </div>

              {isLoggedIn && isStreaming && (
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
      {/* end goLiveEverOpened */}

      {/* ── AUTH modal ── */}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      {/* ── PROFILE modal ── */}
      {showProfile && (
        <div className="modal-overlay" onClick={() => setShowProfile(false)}>
          <div className="modal-box modal-box--sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-box__header">
              <span className="modal-box__title">PROFILE</span>
              <button type="button" className="modal-box__close" onClick={() => setShowProfile(false)}>✕</button>
            </div>

            <div className="stack">
              <div className="profile-avatar">{myAvatar || initials}</div>
              <div className="profile-name">{displayName}</div>
              <div className="profile-handle">@{streamerHandle}</div>

              {authUserId && (
                <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 6, padding: 10 }}>
                  <div className="modal-section-label" style={{ marginBottom: 8 }}>AVATAR</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))', gap: 4 }}>
                    {AVATAR_OPTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void saveAvatar(emoji)}
                        style={{
                          background: myAvatar === emoji ? 'var(--pink-dim)' : 'var(--card)',
                          border: `1px solid ${myAvatar === emoji ? 'var(--pink-border)' : 'var(--border)'}`,
                          borderRadius: 4, fontSize: 20, padding: 6, cursor: 'pointer',
                        }}
                      >{emoji}</button>
                    ))}
                  </div>
                  {avatarSavingMsg && (
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: avatarSavingMsg === 'Saved.' ? 'var(--green)' : 'var(--danger)', marginTop: 6 }}>
                      {avatarSavingMsg}
                    </p>
                  )}
                </div>
              )}

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
                {authUserId && (
                  <div className="profile-stat" style={{ gridColumn: 'span 3' }}>
                    <div className="profile-stat__label">TOKENS · jerk or vouch</div>
                    <div className="profile-stat__value" style={{ color: 'var(--gold)' }}>🪙 {myTokens}</div>
                  </div>
                )}
              </div>

              {authEmail && (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--green)', textAlign: 'center' }}>
                  Signed in as {authEmail}
                </p>
              )}

              {authUserId && (
                <div style={{ background: 'var(--card2)', border: '1px solid var(--border)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="modal-section-label">{needsUsername ? 'CHOOSE A USERNAME' : 'USERNAME'}</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      className="select"
                      style={{ flex: 1 }}
                      value={usernameDraft}
                      onChange={(e) => setUsernameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void saveUsername() }}
                      placeholder="your-handle"
                      disabled={usernameSaveBusy}
                    />
                    <button type="button" className="btn btn--primary" onClick={() => void saveUsername()} disabled={usernameSaveBusy || !usernameDraft.trim()}>
                      {usernameSaveBusy ? 'SAVING' : 'SAVE'}
                    </button>
                  </div>
                  {usernameSaveMsg && (
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: usernameSaveMsg === 'Saved.' ? 'var(--green)' : 'var(--danger)' }}>
                      {usernameSaveMsg}
                    </p>
                  )}
                  {needsUsername && !usernameSaveMsg && (
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)' }}>
                      Pick a unique handle. Used to identify you on the leaderboard and in streams.
                    </p>
                  )}
                </div>
              )}
              {!authUserId && loginMode === 'guest' && (
                <button type="button" className="btn btn--primary" onClick={() => { setShowProfile(false); setShowAuth(true) }}>
                  SIGN IN TO SAVE STATS
                </button>
              )}
              {authUserId && (
                <button type="button" className="btn btn-muted" style={{ fontSize: 10 }} onClick={() => {
                  const supa = getSupabase()
                  if (supa) void supa.auth.signOut()
                  setShowProfile(false)
                }}>
                  SIGN OUT
                </button>
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
          isStreaming={isStreaming}
          streamStartTime={streamStartTime}
          isGoLiveMinimized={isGoLiveMinimized}
          onExpandGoLive={() => { setIsGoLiveMinimized(false); setShowGoLive(true) }}
        />
      )}
    </div>
  )
}

export default App
