export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
export const formatDuration = (ms: number) => formatClock(ms / 1000)
export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
export const END_REASON_LABEL = { time_up: 'Time up', destroyed: 'Ship destroyed' } as const
