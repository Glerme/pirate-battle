import { useId, type KeyboardEvent, type ReactNode } from 'react'

interface Props<T extends string> {
  label: string
  tabs: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  children: ReactNode
}

/** WAI-ARIA tabs with automatic activation: arrows, Home and End move focus and selection. */
export function Tabs<T extends string>({ label, tabs, value, onChange, children }: Props<T>) {
  const base = useId()
  const tabId = (id: string) => `${base}-tab-${id}`
  const onKeyDown = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value)
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key]
    if (next === undefined) return
    e.preventDefault()
    const t = tabs[(next + tabs.length) % tabs.length]
    if (!t) return
    onChange(t.id)
    document.getElementById(tabId(t.id))?.focus()
  }
  return (
    <div className="tabs">
      <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            id={tabId(t.id)}
            role="tab"
            type="button"
            aria-selected={t.id === value}
            aria-controls={`${base}-panel`}
            tabIndex={t.id === value ? 0 : -1}
            className={`btn btn-${t.id === value ? 'primary' : 'secondary'} tab`}
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${base}-panel`} aria-labelledby={tabId(value)} tabIndex={0} className="tabpanel">
        {children}
      </div>
    </div>
  )
}
