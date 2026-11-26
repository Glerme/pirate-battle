import { QueryClient, keepPreviousData, useQuery } from '@tanstack/react-query'
import { getHistory, getRanking } from './client'
import { DEFAULT_PAGE_SIZE } from './contracts'
import type { ApiError, HistoryParams, MatchRecord, Page, RankingEntry, RankingParams } from './contracts'

export const queryKeys = {
  rankings: ['ranking'] as const,
  ranking: ({ sessionTimeSec, spawnIntervalSec, page = 1, pageSize = DEFAULT_PAGE_SIZE }: RankingParams) =>
    ['ranking', sessionTimeSec, spawnIntervalSec, page, pageSize] as const,
  histories: ['history'] as const,
  history: ({ playerId, page = 1, pageSize = DEFAULT_PAGE_SIZE }: HistoryParams) =>
    ['history', playerId, page, pageSize] as const,
  registerMatch: (matchId: string) => ['registerMatch', matchId] as const,
}

export function isPermanentApiError(error: unknown) {
  const { kind, status } = (error ?? {}) as Partial<ApiError>
  return kind === 'http' && status !== undefined
    && status >= 400 && status < 500 && status !== 408 && status !== 429
}

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) => failureCount < 3 && !isPermanentApiError(error),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30000),
      },
    },
  })
}

export async function invalidateMatchQueries(client: QueryClient) {
  const filters = [queryKeys.rankings, queryKeys.histories].map((queryKey) => ({ queryKey }))
  // Cancel even initial fetches without cached data before refetching.
  await Promise.all(filters.map((filter) => client.cancelQueries(filter)))
  await Promise.all(filters.map((filter) => client.invalidateQueries(filter)))
}

export function useRankingQuery(params: RankingParams) {
  return useQuery<Page<RankingEntry>, ApiError>({
    queryKey: queryKeys.ranking(params),
    queryFn: ({ signal }) => getRanking(params, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  })
}

export function useHistoryQuery(params: HistoryParams) {
  return useQuery<Page<MatchRecord>, ApiError>({
    queryKey: queryKeys.history(params),
    queryFn: ({ signal }) => getHistory(params, signal),
    placeholderData: keepPreviousData,
    refetchOnMount: 'always',
  })
}
