import type { GameEvent } from '../types'

const FILES = [
  'cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3', 'cannon_broadside', 'ship_wood_hit_1', 'ship_wood_hit_2',
  'cannonball_water_hit_1', 'cannonball_water_hit_2', 'ship_explosion_1', 'ship_explosion_2', 'ship_collision',
  'score_point', 'game_start', 'game_over', 'game_complete', 'game_pause', 'game_resume', 'time_warning',
  'health_low', 'ocean_ambience_loop',
] as const
export type SoundName = (typeof FILES)[number]

const MUTE_KEY = 'pirate.muted'

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    return false
  }
}

export class SoundManager {
  private ctx?: AudioContext
  private master?: GainNode
  private buffers = new Map<SoundName, AudioBuffer>()
  private loops = new Map<SoundName, AudioBufferSourceNode>()
  private n = 0 // round-robin index for variant sounds
  private destroyed = false
  muted = readMuted()

  /** Fetches and decodes the sounds. Call after a user gesture (Play); failure is non-fatal (game stays silent). */
  async load(): Promise<void> {
    if (this.ctx || this.destroyed) return
    try {
      const ctx = new AudioContext()
      const master = ctx.createGain()
      master.gain.value = this.muted ? 0 : 1
      master.connect(ctx.destination)
      this.ctx = ctx
      this.master = master
      await Promise.all(
        FILES.map(async (name) => {
          const res = await fetch(`${import.meta.env.BASE_URL}assets/sounds/${name}.wav`)
          this.buffers.set(name, await ctx.decodeAudioData(await res.arrayBuffer()))
        }),
      )
    } catch {
      // audio is optional
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : 1
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
    } catch {
      // storage unavailable: mute just won't persist
    }
  }

  play(name: SoundName, loop = false): void {
    const { ctx, master } = this
    const buffer = this.buffers.get(name)
    if (!ctx || !master || !buffer || this.destroyed || (this.muted && !loop)) return
    if (loop && this.loops.has(name)) return
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop = loop
    src.connect(master)
    src.start()
    if (loop) this.loops.set(name, src)
  }

  stop(name: SoundName): void {
    this.loops.get(name)?.stop()
    this.loops.delete(name)
  }

  startAmbience = () => this.play('ocean_ambience_loop', true)
  stopAmbience = () => this.stop('ocean_ambience_loop')

  handle(events: readonly GameEvent[]): void {
    for (const e of events) {
      const i = this.n++
      switch (e.type) {
        case 'shot':
          this.play(e.weapon === 'front' ? (`cannon_fire_${(i % 3) + 1}` as SoundName) : e.weapon === 'enemy' ? 'cannon_fire_2' : 'cannon_broadside')
          break
        case 'hit': this.play(`ship_wood_hit_${(i % 2) + 1}` as SoundName); break
        case 'splash': this.play(`cannonball_water_hit_${(i % 2) + 1}` as SoundName); break
        case 'destroyed':
          this.play(`ship_explosion_${(i % 2) + 1}` as SoundName)
          if (e.byPlayer) this.play('score_point')
          break
        case 'chaserRam': this.play('ship_explosion_2'); this.play('ship_collision'); break
        case 'matchEnded': this.stopAmbience(); this.play(e.result === 'time_up' ? 'game_complete' : 'game_over'); break
        default: break
      }
    }
  }

  destroy(): void {
    this.destroyed = true
    this.loops.forEach((s) => s.stop())
    this.loops.clear()
    this.buffers.clear()
    void this.ctx?.close().catch(() => undefined)
    this.ctx = undefined
  }
}
