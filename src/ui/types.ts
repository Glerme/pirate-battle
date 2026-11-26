import type { ApiError, Page } from '../api/contracts'

/** Presentational shape of a paged remote list; T4 hooks adapt TanStack results to it. */
export interface ListState<T> {
  status: 'loading' | 'error' | 'success'
  page?: Page<T>
  /** True while refetching with data already on screen. */
  isFetching: boolean
  error?: ApiError
  retry(): void
  /** True when that page is already in the query cache, so it can be shown without waiting for a request. */
  isPageCached(page: number): boolean
}

export type RegistrationState = {
  status: 'saving' | 'saved' | 'pending' | 'failed'
  retry(): void
}
