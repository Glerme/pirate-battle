import { Application, Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js'
import { DEFAULT_GAME_CONFIG } from '../config'
import { getTexture, hasTexture } from '../assets'
import type { SoundManager } from '../audio'
import type { GameEvent, MapData, ProjectileState, Renderer, ShipState, WorldSnapshot } from '../types'

const { width: ARENA_W, height: ARENA_H } = DEFAULT_GAME_CONFIG.arena
const SHAKE_MS = 160
const FLASH_MS = 110
const EXPLOSION = ['explosion_3', 'explosion_2', 'explosion_1']

/** Previous/current simulated pose, so render(alpha) can interpolate between fixed steps. */
interface Track { px: number; py: number; pr: number; x: number; y: number; r: number }

interface ShipView {
  hull: Container
  body: Sprite
  fire: Sprite
  bar: Container
  frame: Sprite
  fill: Sprite
  t: Track
  dmg: number
  fillKey: string
  flashMs: number
  seen: number
}

interface ProjView { sprite: Sprite; t: Track; seen: number }

interface Fx { sprite: Sprite; frames: Texture[]; age: number; dur: number; s0: number; s1: number }

const lerp = (a: number, b: number, k: number) => a + (b - a) * k
const lerpAngle = (a: number, b: number, k: number) => a + (((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI) * k

function setPose(t: Track, x: number, y: number, r: number, stepped: boolean, fresh: boolean) {
  if (fresh) Object.assign(t, { px: x, py: y, pr: r, x, y, r })
  else if (stepped) Object.assign(t, { px: t.x, py: t.y, pr: t.r, x, y, r })
}

const damageState = (s: ShipState) => {
  const k = s.hp / s.maxHp
  return k > 0.75 ? 0 : k > 0.5 ? 1 : k > 0.25 ? 2 : 3
}

export class PixiRenderer implements Renderer {
  private app?: Application
  private disposed = false
  private ready = false
  private observer?: ResizeObserver
  private world = new Container()
  private tiles = new Container()
  private shipLayer = new Container()
  private projLayer = new Container()
  private fxLayer = new Container()
  private barLayer = new Container()
  private map?: MapData
  private ships = new Map<number, ShipView>()
  private freeShips: ShipView[] = []
  private projs = new Map<number, ProjView>()
  private freeProjs: ProjView[] = []
  private activeFx: Fx[] = []
  private freeFx: Fx[] = []
  private fillTextures = new Map<string, Texture>()
  private ring?: Texture
  private lastSim = Number.NaN
  private stamp = 0
  private shakeMs = 0
  private simMs = 0
  private base = { x: 0, y: 0 }

  constructor(private readonly sound?: SoundManager) {
    this.world.addChild(this.tiles, this.shipLayer, this.projLayer, this.fxLayer, this.barLayer)
  }

  async init(container: HTMLElement): Promise<void> {
    const app = new Application()
    await app.init({
      resizeTo: container,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      antialias: true,
      background: 0x0b2236,
      autoStart: false, // the session owns the loop and calls render()
    })
    if (this.disposed) {
      app.destroy(true, { children: true })
      return
    }
    this.app = app
    app.stage.addChild(this.world)
    this.ring = app.renderer.generateTexture(new Graphics().circle(0, 0, 30).stroke({ width: 4, color: 0xffffff }))
    container.appendChild(app.canvas)
    this.observer = new ResizeObserver(() => this.resize())
    this.observer.observe(container)
    this.ready = true
    this.resize()
  }

  resize(): void {
    const { app } = this
    if (!app || !this.ready) return
    app.resize()
    const { width, height } = app.renderer.screen
    const s = Math.min(width / ARENA_W, height / ARENA_H) || 1
    this.world.scale.set(s)
    this.base = { x: (width - ARENA_W * s) / 2, y: (height - ARENA_H * s) / 2 }
    this.world.position.set(this.base.x, this.base.y)
  }

  render(world: WorldSnapshot, alpha: number): void {
    const { app } = this
    if (!app || !this.ready) return
    const stepped = world.simTimeMs !== this.lastSim
    const dt = Number.isNaN(this.lastSim) ? 0 : Math.min(Math.max(world.simTimeMs - this.lastSim, 0), 100)
    this.lastSim = world.simTimeMs
    this.simMs = world.simTimeMs
    this.stamp++

    if (world.map !== this.map) this.buildMap(world.map)
    this.syncShips(world.ships, stepped, alpha)
    this.syncProjectiles(world.projectiles, stepped, alpha)
    for (const e of world.events) this.onEvent(e)
    this.sound?.handle(world.events)
    this.updateEffects(dt)

    this.shakeMs = Math.max(0, this.shakeMs - dt)
    const a = (this.shakeMs / SHAKE_MS) * 5 * this.world.scale.x
    this.world.position.set(this.base.x + Math.sin(this.simMs * 0.9) * a, this.base.y + Math.cos(this.simMs * 1.3) * a)
    app.render()
  }

  destroy(): void {
    this.disposed = true
    if (!this.app) return // init() still in flight: it tears the app down itself when it resumes
    this.ready = false
    this.observer?.disconnect()
    this.fillTextures.forEach((t) => t.destroy(false))
    this.fillTextures.clear()
    this.ring?.destroy(true)
    // children only: atlas textures are shared and stay in the Assets cache
    this.app.destroy(true, { children: true })
    this.app = undefined
    this.ships.clear(); this.freeShips = []; this.projs.clear(); this.freeProjs = []
    this.activeFx = []; this.freeFx = []
  }

  private buildMap(map: MapData) {
    this.map = map
    this.tiles.removeChildren().forEach((c) => c.destroy())
    map.tiles.forEach((n, i) => {
      const name = `tile_${n}`
      if (!hasTexture(name)) return
      const s = new Sprite(getTexture(name))
      s.position.set((i % map.cols) * map.tileSize, Math.floor(i / map.cols) * map.tileSize)
      this.tiles.addChild(s)
    })
  }

  private newShipView(): ShipView {
    const hull = new Container()
    const body = new Sprite(); body.anchor.set(0.5)
    const fire = new Sprite(getTexture('fire_1')); fire.anchor.set(0.5); fire.position.set(0, 6)
    hull.addChild(body, fire)
    const bar = new Container()
    const frame = new Sprite(); frame.anchor.set(0.5)
    const fill = new Sprite(); fill.anchor.set(0, 0.5)
    bar.addChild(frame, fill)
    this.shipLayer.addChild(hull)
    this.barLayer.addChild(bar)
    return { hull, body, fire, bar, frame, fill, t: { px: 0, py: 0, pr: 0, x: 0, y: 0, r: 0 }, dmg: -1, fillKey: '', flashMs: 0, seen: 0 }
  }

  private syncShips(ships: readonly ShipState[], stepped: boolean, alpha: number) {
    for (const s of ships) {
      if (!s.alive) continue
      let v = this.ships.get(s.id)
      const fresh = !v
      if (!v) {
        v = this.freeShips.pop() ?? this.newShipView()
        v.hull.visible = v.bar.visible = true
        v.dmg = -1; v.fillKey = ''; v.flashMs = 0
        this.ships.set(s.id, v)
        const player = s.kind === 'player'
        const bar = player ? 'health_frame' : 'enemy_health_frame'
        v.frame.texture = getTexture(bar)
        v.bar.scale.set(player ? 0.36 : 0.42)
      }
      v.seen = this.stamp
      setPose(v.t, s.x, s.y, s.rotation, stepped, fresh)
      const t = v.t
      const x = lerp(t.px, t.x, alpha), y = lerp(t.py, t.y, alpha)
      v.hull.position.set(x, y)
      v.hull.rotation = lerpAngle(t.pr, t.r, alpha)
      v.bar.position.set(x, y - 72) // not parented to the hull, so it never rotates

      const dmg = damageState(s)
      if (dmg !== v.dmg) {
        v.dmg = dmg
        v.body.texture = getTexture(`ship_${DEFAULT_GAME_CONFIG.ships[s.kind].colorIndex * 4 + dmg + 1}`)
      }
      const burning = dmg >= 2
      v.fire.visible = burning
      if (burning) v.fire.texture = getTexture(Math.floor(this.simMs / 120) % 2 ? 'fire_1' : 'fire_2')
      v.flashMs = Math.max(0, v.flashMs - (stepped ? 16.7 : 0))
      v.body.tint = v.flashMs > 0 ? 0xff7070 : 0xffffff
      this.setBar(v, s)
    }
    for (const [id, v] of this.ships) {
      if (v.seen === this.stamp) continue
      v.hull.visible = v.bar.visible = false
      this.ships.delete(id)
      this.freeShips.push(v)
    }
  }

  private setBar(v: ShipView, s: ShipState) {
    const k = Math.min(Math.max(s.hp / s.maxHp, 0), 1)
    const player = s.kind === 'player'
    const name = (player ? 'health_fill_' : 'enemy_health_fill_') + (k > 0.5 ? 'green' : player && k > 0.25 ? 'amber' : 'red')
    const key = `${name}:${s.hp}/${s.maxHp}`
    if (key === v.fillKey) return
    v.fillKey = key
    let tex = this.fillTextures.get(key)
    if (!tex) {
      const full = getTexture(name)
      const f = full.frame
      tex = new Texture({ source: full.source, frame: new Rectangle(f.x, f.y, f.width * k, f.height) })
      this.fillTextures.set(key, tex)
    }
    v.fill.texture = tex
    v.fill.visible = k > 0
    v.fill.x = -v.frame.texture.width / 2
  }

  private syncProjectiles(list: readonly ProjectileState[], stepped: boolean, alpha: number) {
    for (const p of list) {
      let v = this.projs.get(p.id)
      const fresh = !v
      if (!v) {
        v = this.freeProjs.pop()
        if (!v) {
          const sprite = new Sprite(getTexture('cannon_ball')); sprite.anchor.set(0.5)
          this.projLayer.addChild(sprite)
          v = { sprite, t: { px: 0, py: 0, pr: 0, x: 0, y: 0, r: 0 }, seen: 0 }
        }
        v.sprite.visible = true
        this.projs.set(p.id, v)
      }
      v.seen = this.stamp
      setPose(v.t, p.x, p.y, p.rotation, stepped, fresh)
      v.sprite.position.set(lerp(v.t.px, v.t.x, alpha), lerp(v.t.py, v.t.y, alpha))
      v.sprite.rotation = v.t.r
    }
    for (const [id, v] of this.projs) {
      if (v.seen === this.stamp) continue
      v.sprite.visible = false
      this.projs.delete(id)
      this.freeProjs.push(v)
    }
  }

  private onEvent(e: GameEvent) {
    switch (e.type) {
      case 'shot': {
        const v = this.ships.get(e.shipId)
        if (!v) return
        const a = v.t.r + (e.weapon === 'left' ? -Math.PI / 2 : e.weapon === 'right' ? Math.PI / 2 : 0)
        this.spawnFx(['explosion_3'], v.t.x + Math.sin(a) * 42, v.t.y - Math.cos(a) * 42, 130, 0.4, 0.8)
        break
      }
      case 'hit': {
        const v = this.ships.get(e.targetId)
        if (v) v.flashMs = FLASH_MS
        this.shakeMs = SHAKE_MS
        this.spawnFx(['explosion_3'], e.x, e.y, 180, 0.6, 1.1)
        break
      }
      case 'splash':
        if (this.ring) this.spawnFx([this.ring], e.x, e.y, 420, 0.3, 1.2)
        break
      case 'destroyed':
      case 'chaserRam':
        this.spawnFx(EXPLOSION, e.x, e.y, 420, 1, 1.5)
        if (e.type === 'chaserRam') this.shakeMs = SHAKE_MS
        break
      default:
        break
    }
  }

  private spawnFx(frames: (string | Texture)[], x: number, y: number, dur: number, s0: number, s1: number) {
    let fx = this.freeFx.pop()
    if (!fx) {
      const sprite = new Sprite(); sprite.anchor.set(0.5)
      this.fxLayer.addChild(sprite)
      fx = { sprite, frames: [], age: 0, dur: 0, s0: 0, s1: 0 }
    }
    Object.assign(fx, { frames: frames.map((f) => (typeof f === 'string' ? getTexture(f) : f)), age: 0, dur, s0, s1 })
    fx.sprite.position.set(x, y)
    fx.sprite.visible = true
    this.activeFx.push(fx)
    this.drawFx(fx)
  }

  private drawFx(fx: Fx) {
    const k = fx.age / fx.dur
    fx.sprite.texture = fx.frames[Math.min(Math.floor(k * fx.frames.length), fx.frames.length - 1)]!
    fx.sprite.scale.set(lerp(fx.s0, fx.s1, k))
    fx.sprite.alpha = fx.frames.length === 1 ? 1 - k : 1
  }

  private updateEffects(dt: number) {
    this.activeFx = this.activeFx.filter((fx) => {
      fx.age += dt
      if (fx.age < fx.dur) {
        this.drawFx(fx)
        return true
      }
      fx.sprite.visible = false
      this.freeFx.push(fx)
      return false
    })
  }
}
