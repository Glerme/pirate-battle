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

/**
 * Loads the atlases for the current devicePixelRatio. `retry` unloads the bundle first so a failed
 * load is not served from a half-populated cache. Textures stay in the Assets cache between matches.
 */
export async function loadGameAssets(onProgress?: (p: AssetLoadProgress) => void, retry = false): Promise<void> {
  const name = bundleName()
  if (!registered.has(name)) {
    Assets.addBundle(name, Object.fromEntries(SHEETS.map((s) => [s, `${base()}${s}${suffix()}.json`])))
    registered.add(name)
  }
  try {
    if (retry) await Assets.unloadBundle(name).catch(() => undefined)
    onProgress?.({ progress: 0, status: 'loading' })
    const loaded = await Assets.loadBundle(name, (progress) => onProgress?.({ progress, status: 'loading' }))
    sheets = SHEETS.map((s) => loaded[s] as Spritesheet)
    onProgress?.({ progress: 1, status: 'ready' })
  } catch (cause) {
    const err = new AssetLoadError('Could not load game assets. Check your connection and retry.', { cause })
    onProgress?.({ progress: 0, status: 'error', error: err.message })
    throw err
  }
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
