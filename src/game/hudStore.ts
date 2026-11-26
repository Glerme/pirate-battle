import type { HudSnapshot } from './types'

export class HudStore {
  private readonly listeners = new Set<() => void>()

  constructor(private snapshot: HudSnapshot) {}

  readonly getSnapshot = (): HudSnapshot => this.snapshot

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  publish(next: HudSnapshot): void {
    const current = this.snapshot
    if (current.status === next.status && current.score === next.score && current.hp === next.hp &&
      current.maxHp === next.maxHp && current.remainingSec === next.remainingSec &&
      current.pauseReason === next.pauseReason) return
    this.snapshot = next
    for (const listener of this.listeners) listener()
  }

  clear(): void { this.listeners.clear() }
}
