import { useEffect, useRef } from 'react'
import { loadGameAssets } from './assets'
import type { SoundManager } from './audio'
import { PixiRenderer } from './render'
import type { AssetLoadProgress, Renderer } from './types'

export interface GameCanvasProps {
  /** Loading progress / error state; render the progress bar and error panel from this. */
  onProgress?: (p: AssetLoadProgress) => void
  /** Called with the initialised renderer once assets are loaded, and with null on teardown. */
  onRenderer?: (r: Renderer | null) => void
  /** Increment to retry after an error (the asset bundle is unloaded and reloaded). */
  attempt?: number
  sound?: SoundManager
  className?: string
}

export function GameCanvas({ onProgress, onRenderer, attempt = 0, sound, className }: GameCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const cb = useRef({ onProgress, onRenderer })
  useEffect(() => {
    cb.current = { onProgress, onRenderer }
  })

  useEffect(() => {
    const el = host.current
    if (!el) return
    let cancelled = false
    const renderer = new PixiRenderer(sound)
    ;(async () => {
      try {
        await loadGameAssets((p) => !cancelled && cb.current.onProgress?.(p), attempt > 0)
        if (cancelled) return
        await renderer.init(el)
        if (!cancelled) cb.current.onRenderer?.(renderer)
      } catch {
        // asset errors were already reported through onProgress
      }
    })()
    return () => {
      cancelled = true
      renderer.destroy()
      cb.current.onRenderer?.(null)
    }
  }, [attempt, sound])

  return <div ref={host} className={className} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
}
