import { delay, http, HttpResponse } from 'msw'
import { API_TIMEOUT_MS } from '../api/client'
import { API_BASE, API_PATHS, DEFAULT_PAGE_SIZE, RANKING_TIEBREAK } from '../api/contracts'
import type { MatchRecord, Page, RankingEntry, ScenarioId } from '../api/contracts'
import { OPTION_LIMITS } from '../game/config'
import { commitMatch, confirmedMatches, fixtureMatches } from './db'
import { isCurrentMockRequest, isRegistrationUnavailable, mockRequest } from './scenarios'

const base = `${globalThis.location?.origin ?? '*'}${API_BASE}`

function errorResponse(status: number, message: string) {
  return HttpResponse.json({ message }, { status })
}

async function scenarioError(scenario: ScenarioId, endpoint: 'ranking' | 'history' | 'register') {
  if (scenario === 'timeout') {
    await delay(API_TIMEOUT_MS + 100)
    return errorResponse(504, 'Simulated request timeout')
  }
  if (scenario === 'network-error') return HttpResponse.error()
  if (scenario === 'http-400') return errorResponse(400, 'Simulated bad request')
  if (scenario === 'http-500' || (scenario === 'ranking-fail' && endpoint === 'ranking')
    || (scenario === 'history-fail' && endpoint === 'history')) {
    return errorResponse(500, 'Simulated server error')
  }
  if (scenario === 'unavailable-then-recover' && endpoint === 'register' && isRegistrationUnavailable()) {
    return errorResponse(503, 'Registration temporarily unavailable')
  }
}

function pageParams(params: URLSearchParams) {
  const page = Number(params.get('page') ?? 1)
  const pageSize = Number(params.get('pageSize') ?? DEFAULT_PAGE_SIZE)
  if (Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger(pageSize) && pageSize > 0) {
    return { page, pageSize }
  }
}

function paginate<T>(items: T[], { page, pageSize }: NonNullable<ReturnType<typeof pageParams>>): Page<T> {
  const offset = (page - 1) * pageSize
  return { items: items.slice(offset, offset + pageSize), page, pageSize, total: items.length, totalPages: Math.ceil(items.length / pageSize) }
}

function allMatches(scenario: ScenarioId) {
  const fixtures = scenario === 'empty' ? [] : fixtureMatches(scenario === 'many-pages')
  return [...fixtures, ...confirmedMatches()]
}

function withinLimits(value: unknown, limits: { min: number; max: number }) {
  return typeof value === 'number' && Number.isFinite(value) && value >= limits.min && value <= limits.max
}

function parseMatch(value: unknown, matchId: string): MatchRecord | undefined {
  if (typeof value !== 'object' || value === null) return
  const { matchId: bodyId, playerId, playerName, endedAt, score, durationMs, endReason, config } =
    value as Partial<MatchRecord>

  if (bodyId !== matchId || typeof playerId !== 'string' || !playerId.trim()
    || typeof playerName !== 'string' || !playerName.trim()
    || typeof endedAt !== 'string' || !Number.isFinite(Date.parse(endedAt))
    || typeof score !== 'number' || !Number.isSafeInteger(score) || score < 0
    || typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 0
    || (endReason !== 'time_up' && endReason !== 'destroyed')
    || !config || !withinLimits(config.sessionTimeSec, OPTION_LIMITS.sessionTimeSec)
    || !withinLimits(config.spawnIntervalSec, OPTION_LIMITS.spawnIntervalSec)) return

  return {
    matchId, playerId, playerName, endedAt, score, durationMs, endReason,
    config: { sessionTimeSec: config.sessionTimeSec, spawnIntervalSec: config.spawnIntervalSec },
  }
}

const rankingComparators: Record<(typeof RANKING_TIEBREAK)[number], (a: MatchRecord, b: MatchRecord) => number> = {
  'score:desc': (a, b) => b.score - a.score,
  'durationMs:asc': (a, b) => a.durationMs - b.durationMs,
  'endedAt:asc': (a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt),
  'matchId:asc': (a, b) => a.matchId < b.matchId ? -1 : Number(a.matchId > b.matchId),
}

export const handlers = [
  http.get(`${base}${API_PATHS.ranking}`, async ({ request }) => {
    const { scenario, latencyMs } = mockRequest()
    const params = new URL(request.url).searchParams
    const pagination = pageParams(params)
    const sessionTimeSec = Number(params.get('sessionTimeSec'))
    const spawnIntervalSec = Number(params.get('spawnIntervalSec'))
    const matches = allMatches(scenario)
    if (latencyMs) await delay(latencyMs)
    const error = await scenarioError(scenario, 'ranking')
    if (error) return error
    if (!pagination || !withinLimits(sessionTimeSec, OPTION_LIMITS.sessionTimeSec)
      || !withinLimits(spawnIntervalSec, OPTION_LIMITS.spawnIntervalSec)) {
      return errorResponse(400, 'Invalid ranking parameters')
    }

    const entries = matches
      .filter(({ config }) => config.sessionTimeSec === sessionTimeSec && config.spawnIntervalSec === spawnIntervalSec)
      .sort((a, b) => {
        for (const rule of RANKING_TIEBREAK) {
          const difference = rankingComparators[rule](a, b)
          if (difference) return difference
        }
        return 0
      })
      .map(({ matchId, playerId, playerName, score, durationMs, endedAt }, index): RankingEntry => ({
        rank: index + 1, matchId, playerId, playerName, score, durationMs, endedAt,
      }))
    return HttpResponse.json(paginate(entries, pagination))
  }),

  http.get(`${base}${decodeURIComponent(API_PATHS.playerMatches(':playerId'))}`, async ({ request, params }) => {
    const { scenario, latencyMs } = mockRequest()
    const pagination = pageParams(new URL(request.url).searchParams)
    const matches = allMatches(scenario).filter(({ playerId }) => playerId === params.playerId)
    if (latencyMs) await delay(latencyMs)
    const error = await scenarioError(scenario, 'history')
    if (error) return error
    if (!pagination) return errorResponse(400, 'Invalid history parameters')
    matches.sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt) || rankingComparators['matchId:asc'](a, b))
    return HttpResponse.json(paginate(matches, pagination))
  }),

  http.put(`${base}${decodeURIComponent(API_PATHS.match(':matchId'))}`, async ({ request, params }) => {
    const context = mockRequest()
    const error = await scenarioError(context.scenario, 'register')
    if (error) return error

    const body = await request.json().catch(() => null)
    const match = typeof params.matchId === 'string' && parseMatch(body, params.matchId)
    if (!match) return errorResponse(400, 'Invalid match record')
    if (!isCurrentMockRequest(context)) return errorResponse(503, 'Mock scenario changed during registration')

    const status = commitMatch(match)
    if (status === 409) return errorResponse(status, 'Match ID already exists with a different record')
    if (status === 201 && context.scenario === 'register-timeout-after-commit') await delay(API_TIMEOUT_MS + 100)
    else if (context.latencyMs) await delay(context.latencyMs)
    return HttpResponse.json(match, { status })
  }),
]
