import type { InputAction, InputSink } from '../types'

const keyActions = new Map<string, InputAction>([
  ['w', 'forward'], ['ArrowUp', 'forward'],
  ['a', 'turnLeft'], ['ArrowLeft', 'turnLeft'],
  ['d', 'turnRight'], ['ArrowRight', 'turnRight'],
  [' ', 'fireFront'], ['q', 'fireLeft'], ['e', 'fireRight'],
])

const excluded = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), dialog, [role="dialog"], [role="alertdialog"]'

function hasExcludedFocus(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(excluded) !== null
}

export class GameInput implements InputSink {
  private readonly touch = new Set<InputAction>()
  private readonly keys = new Map<string, InputAction>()
  readonly actions = new Set<InputAction>()
  private running = false

  constructor(private readonly pause: () => void) {}

  press(action: InputAction): void {
    if (!this.running) return
    this.touch.add(action)
    this.actions.add(action)
  }

  release(action: InputAction): void {
    this.touch.delete(action)
    this.syncAction(action)
  }

  releaseAll(): void {
    this.touch.clear()
    this.keys.clear()
    this.actions.clear()
  }

  start(): void {
    if (this.running) return
    this.running = true
    document.addEventListener('focusin', this.focusIn)
    document.addEventListener('focusout', this.focusOut)
    this.syncFocus(document.activeElement)
  }

  stop(): void {
    this.running = false
    document.removeEventListener('focusin', this.focusIn)
    document.removeEventListener('focusout', this.focusOut)
    this.syncFocus(null)
    this.releaseAll()
  }

  private syncAction(action: InputAction): void {
    if (this.touch.has(action) || [...this.keys.values()].includes(action)) this.actions.add(action)
    else this.actions.delete(action)
  }

  private syncFocus(target: EventTarget | null): void {
    if (this.running && !hasExcludedFocus(target)) {
      window.addEventListener('keydown', this.keyDown)
      window.addEventListener('keyup', this.keyUp)
      return
    }
    window.removeEventListener('keydown', this.keyDown)
    window.removeEventListener('keyup', this.keyUp)
    this.keys.clear()
    for (const action of this.actions) this.syncAction(action)
  }

  private readonly focusIn = (event: FocusEvent) => this.syncFocus(event.target)
  private readonly focusOut = (event: FocusEvent) => this.syncFocus(event.relatedTarget)

  private readonly keyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey ||
      hasExcludedFocus(event.target) || hasExcludedFocus(document.activeElement)) return
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const action = keyActions.get(key)
    if (action) {
      event.preventDefault()
      if (event.repeat) return
      this.keys.set(event.code || key, action)
      this.actions.add(action)
    } else if (key === 'p' || key === 'Escape') {
      event.preventDefault()
      if (!event.repeat) this.pause()
    }
  }

  private readonly keyUp = (event: KeyboardEvent) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
    const id = event.code || key
    const action = this.keys.get(id)
    if (action) {
      this.keys.delete(id)
      this.syncAction(action)
    }
    if (keyActions.has(key) || action || key === 'p' || key === 'Escape') event.preventDefault()
  }
}
