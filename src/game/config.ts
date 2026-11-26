// FROZEN CONTRACT (T0). Workers import this file; changes go through the coordinator.

/** Per-ship-type tuning. Units: px (arena units), px/s, px/s², rad/s. */
export interface ShipConfig {
  maxHp: number
  /** Max forward speed (px/s). */
  speed: number
  /** Forward acceleration (px/s²). */
  accel: number
  /** Rotation speed (rad/s). */
  turnRate: number
  /** Collision circle radius (px). */
  radius: number
  /** Ship color 0..5 (atlas rows are 6 colors per damage level: ship_1-6 full HP … ship_19-24 wreck, so id = damageLevel*6 + colorIndex + 1; renderer maps exact ids). */
  colorIndex: number
}

export interface WeaponConfig {
  damage: number
  /** Projectile speed (px/s). */
  speed: number
  /** Projectile life in simulation ms. */
  lifetimeMs: number
  cooldownMs: number
  /** Projectiles per shot (broadside = 3 parallel). */
  count: number
  /** Distance between parallel projectiles along the hull (px). */
  spacing: number
}

export interface GameConfig {
  match: { durationSec: number }
  spawn: {
    intervalSec: number
    weights: { chaser: number; shooter: number }
    maxAlive: number
    minDistanceFromPlayer: number
    /** Radius around a spawn point that must be free of islands and ships. */
    clearRadius: number
    /** Kinds of the first spawns, in order (guarantees one of each). */
    firstSpawnTypes: readonly ('chaser' | 'shooter')[]
  }
  ships: { player: ShipConfig; chaser: ShipConfig; shooter: ShipConfig }
  weapons: { front: WeaponConfig; broadside: WeaponConfig; enemy: WeaponConfig }
  chaser: { ramDamage: number }
  shooter: { attackRange: number; preferredRange: number; aimToleranceRad: number }
  arena: { width: number; height: number; tileSize: number }
}

export const DEFAULT_GAME_CONFIG: GameConfig = {
  match: { durationSec: 120 },
  spawn: {
    intervalSec: 4,
    weights: { chaser: 1, shooter: 1 },
    maxAlive: 8,
    minDistanceFromPlayer: 400,
    clearRadius: 80,
    firstSpawnTypes: ['chaser', 'shooter'],
  },
  ships: {
    player: { maxHp: 10, speed: 220, accel: 300, turnRate: 2.4, radius: 34, colorIndex: 0 },
    chaser: { maxHp: 2, speed: 180, accel: 260, turnRate: 2.0, radius: 30, colorIndex: 1 },
    shooter: { maxHp: 3, speed: 130, accel: 200, turnRate: 1.6, radius: 32, colorIndex: 2 },
  },
  weapons: {
    front: { damage: 1, speed: 520, lifetimeMs: 1100, cooldownMs: 350, count: 1, spacing: 0 },
    broadside: { damage: 1, speed: 460, lifetimeMs: 900, cooldownMs: 900, count: 3, spacing: 22 },
    enemy: { damage: 1, speed: 380, lifetimeMs: 1400, cooldownMs: 1800, count: 1, spacing: 0 },
  },
  chaser: { ramDamage: 2 },
  shooter: { attackRange: 420, preferredRange: 320, aimToleranceRad: 0.12 },
  arena: { width: 1920, height: 1088, tileSize: 64 },
}

/** User-editable option limits (Options screen). */
export const OPTION_LIMITS = {
  sessionTimeSec: { min: 60, max: 180, default: 120 },
  spawnIntervalSec: { min: 1, max: 15, default: 4 },
} as const

export const CAPTAIN_NAME_LIMITS = { minLength: 2, maxLength: 16 } as const

export interface UserOptions {
  sessionTimeSec: number
  spawnIntervalSec: number
  captainName: string
}

export type DeepReadonly<T> = { readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K] }

function deepFreeze<T>(o: T): DeepReadonly<T> {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o).forEach(deepFreeze)
  }
  return o as DeepReadonly<T>
}

/** Immutable per-match snapshot: defaults overlaid with the user's options. Never mutated mid-match. */
export function createMatchConfig(options: Pick<UserOptions, 'sessionTimeSec' | 'spawnIntervalSec'>): Readonly<DeepReadonly<GameConfig>> {
  const cfg = structuredClone(DEFAULT_GAME_CONFIG)
  cfg.match.durationSec = options.sessionTimeSec
  cfg.spawn.intervalSec = options.spawnIntervalSec
  return deepFreeze(cfg)
}
