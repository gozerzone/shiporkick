const DEFAULT_XP_PER_MINUTE = 10
const MAX_LEVEL = 100

export interface WorkScoreSnapshot {
  xp: number
  level: number
  title: string
  activeMinutes: number
  isActive: boolean
}

interface WorkScoreManagerOptions {
  initialXp?: number
  xpPerMinute?: number
}

interface LevelBracket {
  maxLevel: number
  title: string
}

const LEVEL_BRACKETS: LevelBracket[] = [
  { maxLevel: 1, title: 'Janitor' },
  { maxLevel: 10, title: 'Apprentice' },
  { maxLevel: 20, title: 'Builder' },
  { maxLevel: 30, title: 'Operator' },
  { maxLevel: 40, title: 'Foreman' },
  { maxLevel: 50, title: 'Engineer' },
  { maxLevel: 60, title: 'Strategist' },
  { maxLevel: 70, title: 'Director' },
  { maxLevel: 80, title: 'Master Planner' },
  { maxLevel: 90, title: 'Visioneer' },
  { maxLevel: 99, title: 'Chief Architect' },
  { maxLevel: 100, title: 'Architect' },
]

function clampLevel(level: number) {
  return Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)))
}

export function mapXpToLevel(xp: number) {
  const safeXp = Math.max(0, Math.floor(xp))
  const level = clampLevel(Math.floor(safeXp / 100) + 1)

  for (const bracket of LEVEL_BRACKETS) {
    if (level <= bracket.maxLevel) {
      return {
        level,
        title: bracket.title,
      }
    }
  }

  return {
    level: MAX_LEVEL,
    title: 'Architect',
  }
}

export class WorkScoreManager {
  private xpBase: number
  private readonly xpPerMinute: number
  private isActive = false
  private activeStartedAtMs: number | null = null
  private accumulatedActiveMs = 0

  constructor(options: WorkScoreManagerOptions = {}) {
    this.xpBase = Math.max(0, Math.floor(options.initialXp ?? 0))
    this.xpPerMinute = Math.max(1, Math.floor(options.xpPerMinute ?? DEFAULT_XP_PER_MINUTE))
  }

  startActiveStreaming(nowMs = Date.now()) {
    if (this.isActive) return this.getSnapshot(nowMs)
    this.isActive = true
    this.activeStartedAtMs = nowMs
    return this.getSnapshot(nowMs)
  }

  stopActiveStreaming(nowMs = Date.now()) {
    if (!this.isActive) return this.getSnapshot(nowMs)
    this.rollForward(nowMs)
    this.isActive = false
    this.activeStartedAtMs = null
    return this.getSnapshot(nowMs)
  }

  setBaseXp(nextXp: number, nowMs = Date.now()) {
    this.rollForward(nowMs)
    this.xpBase = Math.max(0, Math.floor(nextXp))
    return this.getSnapshot(nowMs)
  }

  getSnapshot(nowMs = Date.now()): WorkScoreSnapshot {
    this.rollForward(nowMs)
    const earnedXp = this.getEarnedXpFromActiveMs(this.accumulatedActiveMs)
    const xp = this.xpBase + earnedXp
    const rank = mapXpToLevel(xp)

    return {
      xp,
      level: rank.level,
      title: rank.title,
      activeMinutes: Math.floor(this.accumulatedActiveMs / 60000),
      isActive: this.isActive,
    }
  }

  private rollForward(nowMs: number) {
    if (!this.isActive || this.activeStartedAtMs === null) return
    const delta = Math.max(0, nowMs - this.activeStartedAtMs)
    this.accumulatedActiveMs += delta
    this.activeStartedAtMs = nowMs
  }

  private getEarnedXpFromActiveMs(activeMs: number) {
    const fullMinutes = Math.floor(activeMs / 60000)
    return fullMinutes * this.xpPerMinute
  }
}
