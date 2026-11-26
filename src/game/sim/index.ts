import type { ShipConfig, WeaponConfig } from '../config'
import type {
  EndReason, EnemyKind, GameEvent, InputAction, MatchConfig, ProjectileState,
  ShipKind, ShipState, Vec2, WeaponId, WorldSnapshot,
} from '../types'
import { angleDelta, bearing, circleHit, clamp, direction, distance, islandHit, nearIsland, pushOutOfIslands } from './geometry'
import { map, spawnPoints } from './map'

const STEP_SEC = 1 / 60
export const STEP_MS = 1000 / 60
export const MAX_FRAME_MS = 250
const CLOCK_EPSILON_MS = 1e-8

interface Ship extends ShipState {
  speed: number
  readyAt: Record<WeaponId, number>
}

interface Projectile extends ProjectileState {
  velocity: Vec2
  damage: number
  expiresAt: number
}

const playerWeapons = [
  { action: 'fireFront', id: 'front', offset: 0 },
  { action: 'fireLeft', id: 'left', offset: -Math.PI / 2 },
  { action: 'fireRight', id: 'right', offset: Math.PI / 2 },
] as const

export class Simulation {
  private readonly events: GameEvent[] = []
  private readonly ships: Ship[] = []
  private projectiles: Projectile[] = []
  private readonly player: Ship
  private ticks = 0
  private accumulator = 0
  private nextId = 1
  private spawnTick = 1
  private spawned = 0
  private rng = 0
  private points = 0
  private reason: EndReason | undefined

  constructor(private readonly config: MatchConfig, seed: number) {
    this.setSeed(seed)
    this.player = this.addShip('player', {
      x: config.arena.width / 2,
      y: config.arena.height * 0.75,
    }, 0)
  }

  get simTimeMs(): number { return this.ticks * 1000 / 60 }
  get score(): number { return this.points }
  get hp(): number { return this.player.hp }
  get endReason(): EndReason | undefined { return this.reason }
  get remainingSec(): number {
    return Math.max(0, Math.ceil(this.config.match.durationSec - this.simTimeMs / 1000))
  }

  get snapshot(): WorldSnapshot {
    return { map, ships: this.ships, projectiles: this.projectiles, events: this.events, simTimeMs: this.simTimeMs }
  }

  setSeed(seed: number): void { this.rng = seed >>> 0 }
  resetAccumulator(): void { this.accumulator = 0 }
  clearEvents(): void { this.events.length = 0 }

  advance(dtMs: number, input: ReadonlySet<InputAction>): number {
    if (this.reason || !Number.isFinite(dtMs) || dtMs <= 0) return 0
    this.accumulator += Math.min(dtMs, MAX_FRAME_MS)
    while (this.accumulator + CLOCK_EPSILON_MS >= STEP_MS && !this.reason) {
      this.accumulator -= STEP_MS
      this.step(input)
      this.removeDeadEnemies()
    }
    return this.reason ? 0 : Math.max(0, this.accumulator / STEP_MS)
  }

  private step(input: ReadonlySet<InputAction>): void {
    for (const ship of this.ships) {
      ship.prevX = ship.x
      ship.prevY = ship.y
      ship.prevRotation = ship.rotation
    }
    this.ticks++
    if (this.remainingSec === 0) {
      this.end('time_up')
      return
    }

    const playerConfig = this.config.ships.player
    const turn = Number(input.has('turnRight')) - Number(input.has('turnLeft'))
    this.player.rotation += turn * playerConfig.turnRate * STEP_SEC
    this.move(this.player, playerConfig, input.has('forward'))

    this.updateProjectiles()
    if (this.reason) return

    for (const { action, id, offset } of playerWeapons) {
      if (input.has(action)) {
        this.fire(this.player, id, id === 'front' ? this.config.weapons.front : this.config.weapons.broadside, offset)
      }
    }

    for (const ship of this.ships) {
      if (ship.kind === 'player' || !ship.alive) continue
      this.updateEnemy(ship, ship.kind)
      if (this.reason) return
    }

    if (this.simTimeMs + CLOCK_EPSILON_MS >= this.spawnTick * this.config.spawn.intervalSec * 1000) {
      this.spawnTick++
      this.spawn()
    }
  }

  private removeDeadEnemies(): void {
    for (let i = this.ships.length - 1; i > 0; i--) {
      if (!this.ships[i]?.alive) this.ships.splice(i, 1)
    }
  }

  private addShip(kind: ShipKind, position: Vec2, rotation: number): Ship {
    const maxHp = this.config.ships[kind].maxHp
    const ship: Ship = {
      id: this.nextId++, kind, ...position, rotation, hp: maxHp, maxHp, alive: true, speed: 0,
      prevX: position.x, prevY: position.y, prevRotation: rotation,
      readyAt: { front: 0, left: 0, right: 0, enemy: 0 },
    }
    this.ships.push(ship)
    return ship
  }

  private insideArena(point: Vec2, margin = 0): boolean {
    const { width, height } = this.config.arena
    return point.x >= margin && point.y >= margin && point.x <= width - margin && point.y <= height - margin
  }

  private move(ship: Ship, config: ShipConfig, forward: boolean): void {
    ship.speed = forward ? Math.min(config.speed, ship.speed + config.accel * STEP_SEC) : 0
    const heading = direction(ship.rotation)
    ship.x += heading.x * ship.speed * STEP_SEC
    ship.y += heading.y * ship.speed * STEP_SEC
    pushOutOfIslands(ship, config.radius)
    ship.x = clamp(ship.x, config.radius, this.config.arena.width - config.radius)
    ship.y = clamp(ship.y, config.radius, this.config.arena.height - config.radius)
  }

  private fire(ship: Ship, weapon: WeaponId, tuning: WeaponConfig, offset: number): void {
    if (this.simTimeMs + CLOCK_EPSILON_MS < ship.readyAt[weapon]) return
    ship.readyAt[weapon] = this.simTimeMs + tuning.cooldownMs
    const rotation = ship.rotation + offset
    const heading = direction(rotation)
    const hull = direction(ship.rotation)
    const muzzle = this.config.ships[ship.kind].radius
    for (let i = 0; i < tuning.count; i++) {
      const alongHull = (i - (tuning.count - 1) / 2) * tuning.spacing
      const delta = { x: heading.x * muzzle + hull.x * alongHull, y: heading.y * muzzle + hull.y * alongHull }
      const obstruction = islandHit(ship, delta)
      if (Number.isFinite(obstruction)) {
        this.events.push({ type: 'splash', x: ship.x + obstruction * delta.x, y: ship.y + obstruction * delta.y })
        continue
      }

      const x = ship.x + delta.x
      const y = ship.y + delta.y
      if (!this.insideArena({ x, y })) continue
      this.projectiles.push({
        id: this.nextId++, faction: ship.kind === 'player' ? 'player' : 'enemy',
        x, y, prevX: x, prevY: y, rotation,
        velocity: { x: heading.x * tuning.speed, y: heading.y * tuning.speed },
        damage: tuning.damage, expiresAt: this.simTimeMs + tuning.lifetimeMs,
      })
    }
    this.events.push({ type: 'shot', weapon, shipId: ship.id })
  }

  private updateProjectiles(): void {
    const projectiles = this.projectiles
    this.projectiles = []
    for (const [index, projectile] of projectiles.entries()) {
      if (this.reason) {
        this.projectiles.push(...projectiles.slice(index))
        break
      }
      if (!this.insideArena(projectile)) continue
      const seconds = clamp((projectile.expiresAt - (this.simTimeMs - STEP_MS)) / 1000, 0, STEP_SEC)
      const delta = { x: projectile.velocity.x * seconds, y: projectile.velocity.y * seconds }
      let contact = islandHit(projectile, delta)
      let target: Ship | undefined
      for (const ship of this.ships) {
        if (!ship.alive || (ship.kind === 'player') === (projectile.faction === 'player')) continue
        const hit = circleHit(projectile, delta, ship, this.config.ships[ship.kind].radius)
        if (hit < contact) {
          contact = hit
          target = ship
        }
      }

      projectile.prevX = projectile.x
      projectile.prevY = projectile.y
      projectile.x += delta.x * Math.min(contact, 1)
      projectile.y += delta.y * Math.min(contact, 1)
      if (target) this.damage(target, projectile.damage, projectile.faction === 'player')
      else if (Number.isFinite(contact) || projectile.expiresAt <= this.simTimeMs + CLOCK_EPSILON_MS) {
        this.events.push({ type: 'splash', x: projectile.x, y: projectile.y })
      } else if (this.insideArena(projectile)) this.projectiles.push(projectile)
    }
  }

  private damage(ship: Ship, amount: number, byPlayer: boolean): void {
    ship.hp = Math.max(0, ship.hp - amount)
    this.events.push({ type: 'hit', targetId: ship.id, x: ship.x, y: ship.y })
    if (ship.hp > 0) return
    ship.alive = false
    this.events.push({ type: 'destroyed', shipId: ship.id, kind: ship.kind, x: ship.x, y: ship.y, byPlayer })
    if (ship.kind === 'player') this.end('destroyed')
    else if (byPlayer) this.points++
  }

  private updateEnemy(ship: Ship, kind: EnemyKind): void {
    const tuning = this.config.ships[kind]
    const target = bearing(ship, this.player)
    const range = distance(ship, this.player)
    const shooter = this.config.shooter
    const lineOfSight = !Number.isFinite(islandHit(ship, { x: this.player.x - ship.x, y: this.player.y - ship.y }))
    const approach = kind === 'chaser' || range > shooter.preferredRange || !lineOfSight
    const heading = approach ? this.steer(ship, target, tuning.radius, range) : target
    const maxTurn = tuning.turnRate * STEP_SEC
    ship.rotation += clamp(angleDelta(ship.rotation, heading), -maxTurn, maxTurn)
    this.move(ship, tuning, approach && Math.abs(angleDelta(ship.rotation, heading)) < Math.PI / 3)

    if (kind === 'chaser' && distance(ship, this.player) <= tuning.radius + this.config.ships.player.radius) {
      ship.alive = false
      ship.hp = 0
      this.events.push({ type: 'chaserRam', shipId: ship.id, x: ship.x, y: ship.y })
      this.damage(this.player, this.config.chaser.ramDamage, false)
    } else if (kind === 'shooter' && lineOfSight && distance(ship, this.player) <= shooter.attackRange &&
      Math.abs(angleDelta(ship.rotation, bearing(ship, this.player))) <= shooter.aimToleranceRad) {
      this.fire(ship, 'enemy', this.config.weapons.enemy, 0)
    }
  }

  private steer(ship: Ship, target: number, radius: number, range: number): number {
    const length = Math.min(range, radius * 3)
    const candidates = [0, 30, -30, 60, -60, 90, -90, 120, -120, 180]
    let heading = target
    let best = -Infinity
    for (const degrees of candidates) {
      const angle = target + degrees * Math.PI / 180
      const ray = direction(angle)
      const delta = { x: ray.x * length, y: ray.y * length }
      if (!this.insideArena({ x: ship.x + delta.x, y: ship.y + delta.y }, radius)) continue
      // A short margin leaves room to steer back out from contact with an island.
      if (Number.isFinite(islandHit(ship, delta, radius / 2))) continue
      const score = -Math.abs(degrees) - Math.abs(angleDelta(ship.rotation, angle)) * 30
      if (score > best) {
        best = score
        heading = angle
      }
    }
    return heading
  }

  private spawn(): void {
    const tuning = this.config.spawn
    if (this.ships.filter((ship) => ship.kind !== 'player' && ship.alive).length >= tuning.maxAlive) return
    const candidates = spawnPoints.filter((point) =>
      this.insideArena(point, tuning.clearRadius) &&
      distance(point, this.player) >= tuning.minDistanceFromPlayer &&
      !nearIsland(point, tuning.clearRadius) &&
      this.ships.every((ship) => !ship.alive || distance(ship, point) >= tuning.clearRadius + this.config.ships[ship.kind].radius),
    )
    if (!candidates.length) return

    const point = candidates[Math.floor(this.random() * candidates.length)]
    if (!point) return
    const { chaser, shooter } = tuning.weights
    const kind = tuning.firstSpawnTypes[this.spawned] ?? (this.random() * (chaser + shooter) < chaser ? 'chaser' : 'shooter')
    const ship = this.addShip(kind, point, bearing(point, this.player))
    this.spawned++
    this.events.push({ type: 'spawn', shipId: ship.id, kind })
  }

  private random(): number {
    this.rng = (Math.imul(1664525, this.rng) + 1013904223) >>> 0
    return this.rng / 2 ** 32
  }

  private end(reason: EndReason): void {
    this.reason = reason
    this.events.push({ type: 'matchEnded', reason })
  }
}
