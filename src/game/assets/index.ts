import { Assets, type Spritesheet, type Texture } from 'pixi.js'
import type { AssetLoadProgress } from '../types'

const SHEETS = ['ships_miscellaneous_sheet', 'tiles_sheet', 'ui_sheet'] as const

export class AssetLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'AssetLoadError'
  }
}

const suffix = () => (window.devicePixelRatio > 1 ? '@2x' : '')
const bundleName = () => `game${suffix()}`
const base = () => `${import.meta.env.BASE_URL}assets/`

let sheets: Spritesheet[] = []
const registered = new Set<string>()

type Listener = (p: AssetLoadProgress) => void
let inflight: { promise: Promise<void>; listeners: Set<Listener> } | undefined

/**
 * Loads the atlases for the current devicePixelRatio. Concurrent callers (StrictMode double mount, Retry)
 * share one load and one outcome; progress is dropped once it settled, so a late Pixi callback cannot
 * override an error. `retry` unloads the bundle first so a failed load is not served from a half-populated
 * cache. Textures stay in the Assets cache between matches.
 */
export function loadGameAssets(onProgress?: Listener, retry = false): Promise<void> {
  const name = bundleName()
  if (!registered.has(name)) {
    Assets.addBundle(name, Object.fromEntries(SHEETS.map((s) => [s, `${base()}${s}${suffix()}.json`])))
    registered.add(name)
  }
  if (!inflight) {
    const listeners = new Set<Listener>()
    const emit: Listener = (p) => listeners.forEach((l) => l(p))
    let settled = false
    const promise = (async () => {
      try {
        if (retry) await Assets.unloadBundle(name).catch(() => undefined)
        emit({ progress: 0, status: 'loading' })
        const loaded = await Assets.loadBundle(name, (progress) => settled || emit({ progress, status: 'loading' }))
        sheets = SHEETS.map((s) => loaded[s] as Spritesheet)
        settled = true
        emit({ progress: 1, status: 'ready' })
      } catch (cause) {
        settled = true
        const err = new AssetLoadError('Could not load game assets. Check your connection and retry.', { cause })
        emit({ progress: 0, status: 'error', error: err.message })
        throw err
      } finally {
        inflight = undefined
      }
    })()
    inflight = { promise, listeners }
  }
  const { promise, listeners } = inflight
  if (onProgress) listeners.add(onProgress)
  return promise.finally(() => onProgress && listeners.delete(onProgress))
}

/** Frame names are unique across the three atlases (ship_N, tile_N, health_*, ...). */
export function getTexture(frame: string): Texture {
  for (const s of sheets) {
    const t = s.textures[frame]
    if (t) return t
  }
  throw new AssetLoadError(`Missing texture frame "${frame}" (assets not loaded?)`)
}

export const hasTexture = (frame: string) => sheets.some((s) => frame in s.textures)
