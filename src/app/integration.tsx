// THE integration seam. T5 replaces the placeholder bodies below with the real modules:
//   GameCanvas      -> src/game/GameCanvas.tsx (T2)
//   useRankingList / useHistoryList / useRegistration / useNetworkLab -> src/api hooks (T4)
// Screens only depend on the signatures exported here.
import { useEffect, useState } from 'react'
import { DEFAULT_PAGE_SIZE, SCENARIO_IDS, type HistoryParams, type MatchRecord, type Page, type RankingEntry, type RankingParams, type ScenarioId } from '../api/contracts'
import type { MatchConfig, AssetLoadProgress, GameSessionApi, MatchResult } from '../game/types'
import { MockSession } from './mockSession'
import type { ListState, RegistrationState } from '../ui/types'

export interface GameCanvasProps {
  config: MatchConfig
  /** Called once the session exists (before assets finish loading). */
  onSession: (session: GameSessionApi) => void
  onLoadProgress: (p: AssetLoadProgress) => void
}

/** Placeholder: runs a fake session so the HUD, pause and result flows can be exercised without Pixi. */
export function GameCanvas({ config, onSession, onLoadProgress }: GameCanvasProps) {
  useEffect(() => {
    const session = new MockSession(config)
    onSession(session)
    onLoadProgress({ progress: 1, status: 'ready' })
    void session.start()
    return () => session.destroy()
  }, [config, onSession, onLoadProgress])
  return <div className="canvas-placeholder" aria-hidden="true" />
}

const NAMES = ['Captain Flint', 'Red Sparrow', 'Storm Rider', 'Sea Wolf', 'Black Anne', 'Iron Mary']
function mockPage<T>(items: T[], page: number): Page<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / DEFAULT_PAGE_SIZE))
  return { items: items.slice((page - 1) * DEFAULT_PAGE_SIZE, page * DEFAULT_PAGE_SIZE), page, pageSize: DEFAULT_PAGE_SIZE, total: items.length, totalPages }
}
function useMockList<T>(items: T[], page: number): ListState<T> {
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 250)
    return () => clearTimeout(t)
  }, [])
  return { status: loaded ? 'success' : 'loading', page: loaded ? mockPage(items, page) : undefined, isFetching: !loaded, retry: () => undefined }
}

export function useRankingList(params: RankingParams & { page: number }): ListState<RankingEntry> {
  const items: RankingEntry[] = Array.from({ length: 24 }, (_, i) => ({
    rank: i + 1, matchId: `m${i}`, playerId: `p${i}`, playerName: NAMES[i % NAMES.length] ?? '?', score: 40 - i, durationMs: params.sessionTimeSec * 1000, endedAt: new Date(2026, 8, 8, 21, 42 - i).toISOString(),
  }))
  return useMockList(items, params.page)
}

export function useHistoryList(params: HistoryParams & { page: number }): ListState<MatchRecord> {
  const items: MatchRecord[] = Array.from({ length: 12 }, (_, i) => ({
    matchId: `h${i}`, playerId: params.playerId, playerName: 'Captain', endedAt: new Date(2026, 8, 8, 21, 42 - i).toISOString(), score: 20 - i, durationMs: 120000 - i * 1000,
    endReason: i % 3 ? 'time_up' : 'destroyed', config: { sessionTimeSec: 120, spawnIntervalSec: 4 },
  }))
  return useMockList(items, params.page)
}

export function useRegistration(result: MatchResult): RegistrationState {
  const [status, setStatus] = useState<RegistrationState['status']>('saving')
  useEffect(() => {
    const t = setTimeout(() => setStatus('saved'), 600)
    return () => clearTimeout(t)
  }, [result.matchId])
  return { status, retry: () => setStatus('saved') }
}

export interface NetworkLab {
  scenario: ScenarioId
  setScenario(id: ScenarioId): void
  resetMockData(): void
  pendingCount: number
}
export function useNetworkLab(): NetworkLab {
  const [scenario, setScenario] = useState<ScenarioId>('success')
  return { scenario, setScenario, resetMockData: () => setScenario('success'), pendingCount: 0 }
}
export { SCENARIO_IDS }
