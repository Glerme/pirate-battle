import type { MatchRecord } from '../api/contracts'
import { DEFAULT_GAME_CONFIG } from '../game/config'

const storageKey = 'pirate.mockMatches'
const defaultConfig = {
  sessionTimeSec: DEFAULT_GAME_CONFIG.match.durationSec,
  spawnIntervalSec: DEFAULT_GAME_CONFIG.spawn.intervalSec,
}

const fixtures = Array.from({ length: 86 }, (_, index): MatchRecord => ({
  matchId: `fixture-match-${index + 1}`,
  playerId: `fixture-player-${index + 1}`,
  playerName: `Captain ${index + 1}`,
  endedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  score: (index * 7) % 18,
  durationMs: 45000 + (index % 5) * 3000,
  endReason: 'destroyed',
  config: index < 80 ? defaultConfig : { sessionTimeSec: index % 2 === 0 ? 60 : 180, spawnIntervalSec: 4 },
}))

export function fixtureMatches(manyPages: boolean) {
  return manyPages ? fixtures : [...fixtures.slice(0, 40), ...fixtures.slice(80)]
}

export function confirmedMatches(): MatchRecord[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    return Array.isArray(stored) ? stored : []
  } catch {
    return []
  }
}

export function commitMatch(record: MatchRecord) {
  const records = confirmedMatches()
  const existing = records.find((match) => match.matchId === record.matchId)
    ?? fixtures.find((match) => match.matchId === record.matchId)
  if (existing) {
    const same = Object.keys(record).every((key) => {
      if (key === 'config') {
        return existing.config.sessionTimeSec === record.config.sessionTimeSec
          && existing.config.spawnIntervalSec === record.config.spawnIntervalSec
      }
      const field = key as Exclude<keyof MatchRecord, 'config'>
      return existing[field] === record[field]
    })
    return same ? 200 : 409
  }

  localStorage.setItem(storageKey, JSON.stringify([...records, record]))
  return 201
}

export function clearConfirmedMatches() {
  localStorage.removeItem(storageKey)
}
