import { CAPTAIN_NAME_LIMITS, OPTION_LIMITS, type UserOptions } from '../game/config'
import type { MatchResult } from '../game/types'

const KEYS = {
  options: 'pirate.options.v1',
  playerId: 'pirate.playerId.v1',
  lastResult: 'pirate.lastResult.v1',
} as const

// localStorage can throw (private mode, blocked storage); every access degrades to "no data".
function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage unavailable: keep running with in-memory state only */
  }
}

export const DEFAULT_OPTIONS: UserOptions = {
  sessionTimeSec: OPTION_LIMITS.sessionTimeSec.default,
  spawnIntervalSec: OPTION_LIMITS.spawnIntervalSec.default,
  captainName: 'Captain',
}

export type OptionsDraft = Record<keyof UserOptions, string>
export type OptionsErrors = Partial<Record<keyof UserOptions, string>>

function rangeError(raw: string, { min, max }: { min: number; max: number }, unit: string) {
  const n = Number(raw)
  if (raw.trim() === '' || !Number.isInteger(n) || n < min || n > max) return `Enter a whole number from ${min} to ${max} ${unit}.`
}

export function validateOptions(d: OptionsDraft): OptionsErrors {
  const { minLength, maxLength } = CAPTAIN_NAME_LIMITS
  const name = d.captainName.trim()
  const errors: OptionsErrors = {
    sessionTimeSec: rangeError(d.sessionTimeSec, OPTION_LIMITS.sessionTimeSec, 'seconds'),
    spawnIntervalSec: rangeError(d.spawnIntervalSec, OPTION_LIMITS.spawnIntervalSec, 'seconds'),
    captainName: name.length < minLength || name.length > maxLength ? `Use ${minLength} to ${maxLength} characters.` : undefined,
  }
  return Object.fromEntries(Object.entries(errors).filter(([, v]) => v)) as OptionsErrors
}

export const toDraft = (o: UserOptions): OptionsDraft => ({
  sessionTimeSec: String(o.sessionTimeSec),
  spawnIntervalSec: String(o.spawnIntervalSec),
  captainName: o.captainName,
})

export function loadOptions(): UserOptions {
  const stored = read(KEYS.options) as { v?: number; data?: Partial<UserOptions> } | undefined
  const d = stored?.v === 1 ? stored.data : undefined
  const candidate = { ...DEFAULT_OPTIONS, ...d }
  // Corrupt or out-of-range data falls back to defaults as a whole.
  if (!d || Object.keys(validateOptions(toDraft(candidate as UserOptions))).length) return { ...DEFAULT_OPTIONS }
  return { sessionTimeSec: Number(candidate.sessionTimeSec), spawnIntervalSec: Number(candidate.spawnIntervalSec), captainName: String(candidate.captainName).trim() }
}

export function saveOptions(o: UserOptions) {
  write(KEYS.options, { v: 1, data: { ...o, captainName: o.captainName.trim() } })
}

/** Stable anonymous identity: generated once, then reused forever. */
export function getPlayerId(): string {
  const id = read(KEYS.playerId)
  if (typeof id === 'string' && id) return id
  const fresh = crypto.randomUUID()
  write(KEYS.playerId, fresh)
  return fresh
}

function isMatchResult(r: unknown): r is MatchResult {
  const m = r as MatchResult | null
  return (
    !!m && typeof m.matchId === 'string' && Number.isFinite(m.score) && Number.isFinite(m.durationMs) &&
    (m.endReason === 'time_up' || m.endReason === 'destroyed') && typeof m.endedAt === 'string' &&
    Number.isFinite(m.config?.sessionTimeSec) && Number.isFinite(m.config?.spawnIntervalSec)
  )
}

export function loadLastResult(): MatchResult | null {
  const stored = read(KEYS.lastResult) as { v?: number; data?: unknown } | undefined
  return stored?.v === 1 && isMatchResult(stored.data) ? stored.data : null
}
export const saveLastResult = (r: MatchResult) => write(KEYS.lastResult, { v: 1, data: r })
