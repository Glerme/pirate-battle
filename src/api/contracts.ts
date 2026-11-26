// FROZEN CONTRACT (T0). Shared by the API client, MSW handlers and UI; changes go through the coordinator.
import type { EndReason } from '../game/types'

export interface MatchRecord {
  matchId: string
  playerId: string
  playerName: string
  /** ISO-8601 */
  endedAt: string
  score: number
  durationMs: number
  endReason: EndReason
  config: { sessionTimeSec: number; spawnIntervalSec: number }
}

export interface RankingEntry {
  /** 1-based position over the whole filtered ranking (not per page). */
  rank: number
  matchId: string
  playerId: string
  playerName: string
  score: number
  durationMs: number
  endedAt: string
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface PageParams {
  /** 1-based, default 1 */
  page?: number
  /** default 10 */
  pageSize?: number
}

export type HistoryParams = PageParams & { playerId: string }

/** Only matches with the same configuration are ranked together. */
export type RankingParams = PageParams & { sessionTimeSec: number; spawnIntervalSec: number }

export const DEFAULT_PAGE_SIZE = 10

export const API_BASE = '/api'
export const API_PATHS = {
  /** PUT, idempotent by matchId. 201 created, 200 identical record already exists, 409 payload differs. */
  match: (matchId: string) => `/matches/${encodeURIComponent(matchId)}`,
  /** GET ?page&pageSize → Page<MatchRecord>, newest first. */
  playerMatches: (playerId: string) => `/players/${encodeURIComponent(playerId)}/matches`,
  /** GET ?sessionTimeSec&spawnIntervalSec&page&pageSize → Page<RankingEntry>. */
  ranking: '/ranking',
} as const

/** Ranking order: score desc, durationMs asc, endedAt asc, matchId asc. One entry per match. */
export const RANKING_TIEBREAK = ['score:desc', 'durationMs:asc', 'endedAt:asc', 'matchId:asc'] as const

export const SCENARIO_IDS = [
  'success',
  'empty',
  'many-pages',
  'slow',
  'variable-latency',
  'out-of-order',
  'timeout',
  'network-error',
  'http-400',
  'http-500',
  'ranking-fail',
  'history-fail',
  'register-timeout-after-commit',
  'unavailable-then-recover',
] as const
export type ScenarioId = (typeof SCENARIO_IDS)[number]

/** Normalized client error kinds (axios errors are mapped to these). */
export type ApiErrorKind = 'network' | 'timeout' | 'http'

export interface ApiError {
  kind: ApiErrorKind
  /** Present when kind === 'http'. */
  status?: number
  message: string
}

export type RegisterStatus = 'created' | 'existing'
