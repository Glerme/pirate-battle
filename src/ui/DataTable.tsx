import type { ReactNode } from 'react'
import { RoundButton } from './RoundButton'
import { Button } from './Button'
import type { ListState } from './types'

export interface Column<T> {
  header: string
  cell: (row: T) => ReactNode
}

interface Props<T> {
  caption: string
  state: ListState<T>
  columns: Column<T>[]
  rowKey: (row: T) => string
  emptyText: string
  onPage: (page: number) => void
  highlight?: (row: T) => boolean
}

/** Loading / error / empty / data views plus pagination. Data arrives by props; no fetching here. */
export function DataTable<T>({ caption, state, columns, rowKey, emptyText, onPage, highlight }: Props<T>) {
  const { status, page, isFetching, error, retry, isPageCached } = state
  if (!page) {
    if (status === 'error') {
      return (
        <div role="alert" className="state-box">
          <p>{error?.message ?? 'Something went wrong.'}</p>
          <Button variant="secondary" onClick={retry}>Retry</Button>
        </div>
      )
    }
    return <p role="status" className="state-box">Loading {caption.toLowerCase()}…</p>
  }
  // While refreshing, only allow moving to pages the cache can show immediately.
  const canOpen = (p: number) => p >= 1 && p <= page.totalPages && (!isFetching || isPageCached(p))
  return (
    <div className="datatable" aria-busy={isFetching}>
      {/* Stale data stays visible; a failed refetch is reported without hiding it. */}
      {status === 'error' && (
        <div role="alert" className="state-box inline">
          <span>{error?.message ?? 'Could not refresh.'}</span>
          <Button variant="secondary" onClick={retry}>Retry</Button>
        </div>
      )}
      {page.items.length === 0 ? (
        <p className="state-box">{emptyText}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>{columns.map((c) => <th key={c.header} scope="col">{c.header}</th>)}</tr>
            </thead>
            <tbody>
              {page.items.map((row) => (
                <tr key={rowKey(row)} className={highlight?.(row) ? 'me' : undefined}>
                  {columns.map((c) => <td key={c.header}>{c.cell(row)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav className="pager" aria-label={`${caption} pages`}>
        <RoundButton icon="icon_turn_left" aria-label="Previous page" disabled={!canOpen(page.page - 1)} onClick={() => onPage(page.page - 1)} />
        <span aria-live="polite">Page {page.page} of {Math.max(page.totalPages, 1)}</span>
        <RoundButton icon="icon_turn_right" aria-label="Next page" disabled={!canOpen(page.page + 1)} onClick={() => onPage(page.page + 1)} />
        <span role="status" className={`refresh ${isFetching ? 'on' : ''}`}>{isFetching ? 'Updating…' : ''}</span>
      </nav>
    </div>
  )
}
