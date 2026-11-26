// FROZEN CONTRACT (T0). Workers import this file; changes go through the coordinator.
import type { DeepReadonly, GameConfig } from './config'

export interface Vec2 {
  x: number
  y: number
}

export type Faction = 'player' | 'enemy'
export type EnemyKind = 'chaser' | 'shooter'
export type ShipKind = 'player' | EnemyKind

/** Arena coordinates are logical units (1920×1088); rotation in radians, 0 = pointing up (-y), clockwise positive. */
export interface ShipState {
  id: number
  kind: ShipKind
  x: number
  y: number
  rotation: number
  hp: number
  maxHp: number
  alive: boolean
}

export interface ProjectileState {
  id: number
  x: number
  y: number
  rotation: number
  faction: Faction
}

export type WeaponId = 'front' | 'left' | 'right' | 'enemy'

export type GameEvent =
  | { type: 'shot'; weapon: WeaponId; shipId: number }
  | { type: 'hit'; targetId: number; x: number; y: number }
  | { type: 'destroyed'; shipId: number; kind: ShipKind; x: number; y: number; byPlayer: boolean }
  | { type: 'chaserRam'; shipId: number; x: number; y: number }
  | { type: 'splash'; x: number; y: number }
  | { type: 'spawn'; shipId: number; kind: EnemyKind }
  | { type: 'matchEnded'; result: EndReason }

export type MatchStatus = 'loading' | 'running' | 'paused' | 'ended'
export type EndReason = 'time_up' | 'destroyed'
export type PauseReason = 'manual' | 'blur' | 'hidden' | 'orientation'

/** Static map: tile ids index tile_1..tile_96 of the tiles sheet; solid cells block ships. */
export interface MapData {
  cols: number
  rows: number
  tileSize: number
  /** Row-major, length cols*rows; tile number 1..96 (see public/assets tiles atlas frame `tile_N`). */
  tiles: readonly number[]
  /** Row-major, length cols*rows; true = island/solid (collider). */
  solid: readonly boolean[]
}

/** Read-only view the renderer polls each frame. The sim owns and mutates the underlying state. */
export interface WorldSnapshot {
  readonly map: MapData
  readonly ships: readonly ShipState[]
  readonly projectiles: readonly ProjectileState[]
  /** Events produced since the previous render call; renderer must not retain the array. */
  readonly events: readonly GameEvent[]
  readonly simTimeMs: number
}

/** Published by the session only when a value changes (score, hp, whole seconds, status). */
export interface HudSnapshot {
  status: MatchStatus
  score: number
  hp: number
  maxHp: number
  remainingSec: number
  pauseReason?: PauseReason
}

export interface MatchResult {
  matchId: string
  score: number
  /** Active (non-paused) simulated play time. */
  durationMs: number
  endReason: EndReason
  /** ISO-8601 timestamp. */
  endedAt: string
  config: { sessionTimeSec: number; spawnIntervalSec: number }
}

export type InputAction = 'forward' | 'turnLeft' | 'turnRight' | 'fireFront' | 'fireLeft' | 'fireRight'

export interface InputSink {
  press(a: InputAction): void
  release(a: InputAction): void
  releaseAll(): void
}

export interface GameSessionApi {
  /** Loads assets, then starts combat. Safe under React StrictMode (destroy() during start aborts cleanly). */
  start(): Promise<void>
  pause(reason: PauseReason): void
  resume(): void
  destroy(): void
  readonly input: InputSink
  readonly hud: { subscribe(cb: () => void): () => void; getSnapshot(): HudSnapshot }
  /** Fires once when the match ends. Returns an unsubscribe fn. */
  onEnd(cb: (r: MatchResult) => void): () => void
}

export interface Renderer {
  init(container: HTMLElement): Promise<void>
  /** `alpha` = fraction (0..1) between the last two fixed sim steps, for interpolation. */
  render(world: WorldSnapshot, alpha: number): void
  resize(): void
  destroy(): void
}

export interface AssetLoadProgress {
  /** 0..1 */
  progress: number
  status: 'loading' | 'ready' | 'error'
  error?: string
}

export type MatchConfig = DeepReadonly<GameConfig>
