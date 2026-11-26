import type { AudioControls, GameEvent, GameSessionApi } from '../types'

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

class SoundManager implements AudioControls {
  private ctx?: AudioContext
  private master?: GainNode
  private buffers = new Map<SoundName, AudioBuffer>()
  private loops = new Map<SoundName, AudioBufferSourceNode>()
  private n = 0 // round-robin index for variant sounds
  private muted = readMuted()
  private listeners = new Set<() => void>()

  /** Fetches and decodes the sounds. Call after a user gesture (Play); failure is non-fatal (game stays silent). */
  async load(): Promise<void> {
    if (this.ctx) return
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

  isMuted = () => this.muted

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => void this.listeners.delete(cb)
  }

  setMuted = (muted: boolean): void => {
    this.muted = muted
    this.listeners.forEach((cb) => cb())
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
    if (!ctx || !master || !buffer || (this.muted && !loop)) return
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
        case 'matchEnded': this.stopAmbience(); this.play(e.reason === 'time_up' ? 'game_complete' : 'game_over'); break
        default: break
      }
    }
  }
}

/** Singleton: the context and decoded buffers outlive matches; the renderer plays event sounds through it. */
export const sounds = new SoundManager()
export const audio: AudioControls = sounds

const WARN_SEC = 10

/** Plays status sounds (start/pause/resume/time_warning/health_low) from HUD changes; returns unsubscribe. */
export function bindHudSounds(session: GameSessionApi): () => void {
  let prev = session.hud.getSnapshot()
  void sounds.load()
  return session.hud.subscribe(() => {
    const h = session.hud.getSnapshot()
    if (prev.status !== h.status) {
      if (h.status === 'running') {
        sounds.play(prev.status === 'loading' ? 'game_start' : 'game_resume')
        sounds.startAmbience()
      } else if (h.status === 'paused') sounds.play('game_pause')
    }
    if (h.status === 'running') {
      if (prev.remainingSec > WARN_SEC && h.remainingSec <= WARN_SEC) sounds.play('time_warning')
      if (prev.hp / prev.maxHp > 0.25 && h.hp / h.maxHp <= 0.25 && h.hp > 0) sounds.play('health_low')
    }
    prev = h
  })
}
