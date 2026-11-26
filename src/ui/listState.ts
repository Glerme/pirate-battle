import type { UseQueryResult } from '@tanstack/react-query'
import type { ApiError, Page } from '../api/contracts'
import type { ListState } from './types'

/** Adapts a TanStack query result to the presentational ListState. */
export function toListState<T>(q: UseQueryResult<Page<T>, ApiError>): ListState<T> {
  return {
    status: q.isError && !q.data ? 'error' : q.data ? 'success' : 'loading',
    page: q.data,
    isFetching: q.isFetching,
    error: q.error ?? undefined,
    retry: () => void q.refetch(),
  }
}
