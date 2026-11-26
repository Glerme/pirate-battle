/** Polite, visually hidden announcer. Only text changes are read, so callers pass discrete messages. */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {message}
    </div>
  )
}
