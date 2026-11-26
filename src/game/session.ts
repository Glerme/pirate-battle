import { HudStore } from './hudStore'
import { GameInput } from './input'
import { MAX_FRAME_MS, Simulation } from './sim'
import { bindTesting, manualClock, perfConfig, resolveSeed } from './testing'
import type {
  CreateGameSession, CreateGameSessionOptions, GameSessionApi, HudSnapshot, MatchResult, MatchStatus, PauseReason,
} from './types'

class GameSession implements GameSessionApi {
  readonly input = new GameInput(() => this.pause('manual'))
  readonly hud: HudStore
  private readonly config = perfConfig(this.options.config)
  private readonly sim: Simulation
  private readonly endListeners = new Set<(result: MatchResult) => void>()
  private status: MatchStatus = 'loading'
  private pauseReason: PauseReason | undefined
  private destroyed = false
  private frameId: number | undefined
  private previousFrame: number | undefined
  private unbindTesting?: () => void

  constructor(private readonly options: CreateGameSessionOptions) {
    this.sim = new Simulation(this.config, resolveSeed(options.seed))
    this.hud = new HudStore(this.readHud())
  }

  async start(): Promise<void> {
    if (this.destroyed || this.status !== 'loading') return
    window.addEventListener('blur', this.onBlur)
    document.addEventListener('visibilitychange', this.onVisibilityChange)

    this.unbindTesting = bindTesting({
      getState: () => ({ ...this.sim.snapshot, ...this.readHud() }),
      advance: this.advanceManually,
      setSeed: (seed) => this.sim.setSeed(seed),
    })
    if (document.hidden) this.pauseReason = 'hidden'
    this.status = this.pauseReason ? 'paused' : 'running'
    this.render(1)
    if (this.status === 'running') this.startLoop()
    this.hud.publish(this.readHud())
  }

  pause(reason: PauseReason): void {
    if (this.destroyed) return
    if (this.status === 'loading') {
      this.pauseReason = reason
      return
    }
    if (this.status !== 'running') return
    this.status = 'paused'
    this.pauseReason = reason
    this.stopLoop()
    this.hud.publish(this.readHud())
  }

  resume(): void {
    if (this.destroyed || this.status !== 'paused' || document.hidden) return
    this.sim.resetAccumulator()
    this.status = 'running'
    this.pauseReason = undefined
    this.startLoop()
    this.hud.publish(this.readHud())
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.stopLoop()
    document.removeEventListener('visibilitychange', this.onVisibilityChange)
    window.removeEventListener('blur', this.onBlur)
    this.unbindTesting?.()
    this.hud.clear()
    this.endListeners.clear()
  }

  onEnd(callback: (result: MatchResult) => void): () => void {
    this.endListeners.add(callback)
    return () => this.endListeners.delete(callback)
  }

  private readHud(): HudSnapshot {
    return {
      status: this.status,
      score: this.sim.score,
      hp: Math.ceil(this.sim.hp),
      maxHp: Math.ceil(this.config.ships.player.maxHp),
      remainingSec: this.sim.remainingSec,
      pauseReason: this.pauseReason,
    }
  }

  private readonly onBlur = () => this.pause('blur')
  private readonly onVisibilityChange = () => {
    if (document.hidden) this.pause('hidden')
  }

  private startLoop(): void {
    if (this.destroyed || this.status !== 'running') return
    this.input.start()
    if (!manualClock) this.frameId = requestAnimationFrame(this.frame)
  }

  private stopLoop(): void {
    this.input.stop()
    if (this.frameId !== undefined) cancelAnimationFrame(this.frameId)
    this.frameId = undefined
    this.previousFrame = undefined
  }

  private readonly frame = (timestamp: number) => {
    this.frameId = undefined
    if (this.destroyed || this.status !== 'running') return

    const elapsed = timestamp - (this.previousFrame ?? timestamp)
    this.previousFrame = timestamp
    this.advance(elapsed)
    if (!this.destroyed && this.status === 'running' && this.frameId === undefined) {
      this.frameId = requestAnimationFrame(this.frame)
    }
  }

  private readonly advanceManually = (ms: number) => {
    if (!Number.isFinite(ms)) return
    while (ms > 0 && !this.destroyed && this.status === 'running') {
      const chunk = Math.min(ms, MAX_FRAME_MS)
      this.advance(chunk)
      ms -= chunk
    }
  }

  private advance(ms: number): void {
    const alpha = this.sim.advance(ms, this.input.actions)
    const endReason = this.sim.endReason
    if (endReason) {
      this.status = 'ended'
      this.stopLoop()
    }
    this.render(endReason ? 1 : alpha)
    this.hud.publish(this.readHud())
    if (!endReason) return

    const result: MatchResult = {
      matchId: crypto.randomUUID(),
      score: this.sim.score,
      durationMs: Math.round(this.sim.simTimeMs),
      endedAt: new Date().toISOString(),
      endReason,
      config: {
        sessionTimeSec: this.options.config.match.durationSec,
        spawnIntervalSec: this.options.config.spawn.intervalSec,
      },
    }
    for (const listener of this.endListeners) listener(result)
    this.endListeners.clear()
  }

  private render(alpha: number): void {
    this.options.renderer.render(this.sim.snapshot, alpha)
    this.sim.clearEvents()
  }
}

export const createGameSession: CreateGameSession = (options) => new GameSession(options)
