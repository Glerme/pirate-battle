import type { GameSessionApi, HudSnapshot, InputAction, MatchConfig, MatchResult, PauseReason } from '../game/types'

/** Dev stand-in for the real GameSession (T1/T2): a ticking clock and a score on fireFront. Removed at integration. */
export class MockSession implements GameSessionApi {
  private snap: HudSnapshot
  private subs = new Set<() => void>()
  private ends = new Set<(r: MatchResult) => void>()
  private timer?: ReturnType<typeof setInterval>
  private elapsedSec = 0
  readonly input = {
    press: (a: InputAction) => { if (a === 'fireFront' && this.snap.status === 'running') this.set({ score: this.snap.score + 1 }) },
    release: () => undefined,
    releaseAll: () => undefined,
  }
  readonly hud = {
    subscribe: (cb: () => void) => { this.subs.add(cb); return () => { this.subs.delete(cb) } },
    getSnapshot: () => this.snap,
  }

  constructor(private config: MatchConfig) {
    this.snap = { status: 'loading', score: 0, hp: 10, maxHp: 10, remainingSec: config.match.durationSec }
  }
  private set(p: Partial<HudSnapshot>) {
    this.snap = { ...this.snap, ...p }
    this.subs.forEach((cb) => cb())
  }
  async start() {
    this.set({ status: 'running' })
    this.timer = setInterval(() => {
      if (this.snap.status !== 'running') return
      this.elapsedSec++
      const remainingSec = this.config.match.durationSec - this.elapsedSec
      this.set({ remainingSec })
      if (remainingSec <= 0) this.end()
    }, 1000)
  }
  private end() {
    clearInterval(this.timer)
    this.set({ status: 'ended' })
    const result: MatchResult = {
      matchId: crypto.randomUUID(), score: this.snap.score, durationMs: this.elapsedSec * 1000, endReason: 'time_up',
      endedAt: new Date().toISOString(), config: { sessionTimeSec: this.config.match.durationSec, spawnIntervalSec: this.config.spawn.intervalSec },
    }
    this.ends.forEach((cb) => cb(result))
  }
  pause(reason: PauseReason) { if (this.snap.status === 'running') this.set({ status: 'paused', pauseReason: reason }) }
  resume() { if (this.snap.status === 'paused') this.set({ status: 'running', pauseReason: undefined }) }
  destroy() { clearInterval(this.timer); this.subs.clear(); this.ends.clear() }
  onEnd(cb: (r: MatchResult) => void) { this.ends.add(cb); return () => { this.ends.delete(cb) } }
}
