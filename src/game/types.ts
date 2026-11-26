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
  /** Pose at the previous fixed step, for render interpolation with `alpha`. */
  prevX: number
  prevY: number
  prevRotation: number
  hp: number
  maxHp: number
  alive: boolean
}

export interface ProjectileState {
  id: number
  x: number
  y: number
  rotation: number
  prevX: number
  prevY: number
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
  | { type: 'matchEnded'; reason: EndReason }

export type MatchStatus = 'loading' | 'running' | 'paused' | 'ended'
export type EndReason = 'time_up' | 'destroyed'
export type PauseReason = 'manual' | 'blur' | 'hidden' | 'orientation'

/** Static map: tile ids index tile_1..tile_96 of the tiles sheet; solid cells block ships. */
/** A block of atlas tiles (`tile_N`, N = 1..96) drawn as one image at (x, y) logical px, scaled. */
export interface MapStamp {
  tiles: readonly (readonly number[])[]
  x: number
  y: number
  scale: number
}

/** Static map: sea filled with `seaTile`, then stamps in order. Colliders live in the sim (`islandRects`). */
export interface MapData {
  width: number
  height: number
  tileSize: number
  seaTile: number
  stamps: readonly MapStamp[]
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
  /** Starts combat. Assets are already loaded and the renderer initialized by GameCanvas before the session exists. */
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

/**
 * Ownership (coordinator decision):
 * - T1 `src/game/session.ts` exports `createGameSession: CreateGameSession`. The session owns the frame loop
 *   (its own requestAnimationFrame, or manual stepping in test mode) and calls `renderer.render(world, alpha)`.
 * - T2 Pixi Application is created with `autoStart: false`; `render()` draws once per call. T2 exports
 *   `loadGameAssets(onProgress)` (src/game/assets), `createPixiRenderer(): Renderer` (src/game/render),
 *   `audio: AudioControls` (src/game/audio) and the `GameCanvas` component (src/game/GameCanvas.tsx).
 * - GameCanvas flow: loadGameAssets -> renderer.init(container) -> createGameSession -> start(); on error it
 *   reports status 'error' with `retry`. Unmount destroys session then renderer (StrictMode safe).
 */
export interface CreateGameSessionOptions {
  config: MatchConfig
  seed: number
  renderer: Renderer
}
export type CreateGameSession = (opts: CreateGameSessionOptions) => GameSessionApi

export interface GameCanvasProps {
  config: MatchConfig
  seed: number
  /** Loading progress / failure; `retry` is present when status === 'error'. */
  onLoadState(state: AssetLoadProgress & { retry?: () => void }): void
  /** Called with the live session once started, and with null on teardown. */
  onSession(session: GameSessionApi | null): void
}

/** Sound mute toggle, persisted by T2's audio module; the HUD button (T3) uses it via useSyncExternalStore. */
export interface AudioControls {
  isMuted(): boolean
  setMuted(muted: boolean): void
  subscribe(cb: () => void): () => void
}
