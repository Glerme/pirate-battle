import { useEffect, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  /** Called on Esc / backdrop-less cancel; the parent decides whether to close. */
  onCancel: () => void
  labelledBy: string
  children: ReactNode
  className?: string
}

/** Native modal <dialog>: focus trap, Esc and focus return come from the platform. */
export function Dialog({ open, onCancel, labelledBy, children, className = '' }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])
  // Unmounting while open must not leave the page inert.
  useEffect(() => () => ref.current?.close(), [])
  return (
    <dialog
      ref={ref}
      className={`dialog panel ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
    >
      {open && children}
    </dialog>
  )
}
