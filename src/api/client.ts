import axios from 'axios'
import { API_BASE, API_PATHS } from './contracts'
import type { ApiError, HistoryParams, MatchRecord, Page, RankingEntry, RankingParams, RegisterStatus } from './contracts'

const configuredTimeout = Number(import.meta.env?.VITE_API_TIMEOUT_MS)
export const API_TIMEOUT_MS = Number.isFinite(configuredTimeout) && configuredTimeout > 0
  ? configuredTimeout
  : 5000

const client = axios.create({ baseURL: API_BASE, timeout: API_TIMEOUT_MS })

client.interceptors.response.use(undefined, (error: unknown) => {
  if (axios.isCancel(error) || !axios.isAxiosError(error)) return Promise.reject(error)

  const { message, code, response } = error
  const normalized: ApiError = response
    ? { kind: 'http', status: response.status, message }
    : { kind: code === 'ECONNABORTED' || code === 'ETIMEDOUT' ? 'timeout' : 'network', message }
  return Promise.reject(normalized)
})

export async function getRanking(params: RankingParams, signal?: AbortSignal) {
  const { data } = await client.get<Page<RankingEntry>>(API_PATHS.ranking, { params, signal })
  return data
}

export async function getHistory({ playerId, ...params }: HistoryParams, signal?: AbortSignal) {
  const { data } = await client.get<Page<MatchRecord>>(API_PATHS.playerMatches(playerId), { params, signal })
  return data
}

export async function registerMatch(record: MatchRecord, signal?: AbortSignal): Promise<RegisterStatus> {
  const { status } = await client.put(API_PATHS.match(record.matchId), record, { signal })
  if (status === 201) return 'created'
  if (status === 200) return 'existing'
  throw { kind: 'http', status, message: 'Unexpected registration response' } satisfies ApiError
}
