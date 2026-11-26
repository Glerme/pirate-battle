import { useEffect, useRef } from 'react'
import { loadGameAssets } from './assets'
import { bindHudSounds } from './audio'
import { createPixiRenderer } from './render'
import { createGameSession } from './session'
import type { GameCanvasProps } from './types'

export function GameCanvas({ config, seed, onLoadState, onSession }: GameCanvasProps) {
  const host = useRef<HTMLDivElement>(null)
  const cb = useRef({ onLoadState, onSession })
  useEffect(() => {
    cb.current = { onLoadState, onSession }
  })

  useEffect(() => {
    const el = host.current
    if (!el) return
    let cancelled = false
    let teardown = () => {}

    const run = async (retry: boolean) => {
      if (cancelled) return
      const renderer = createPixiRenderer()
      let session: ReturnType<typeof createGameSession> | undefined
      let unbind = () => {}
      teardown = () => {
        unbind()
        session?.destroy()
        renderer.destroy()
        cb.current.onSession(null)
      }
      try {
        await loadGameAssets((p) => !cancelled && cb.current.onLoadState(p), retry)
        if (cancelled) return
        await renderer.init(el)
        if (cancelled) return
        session = createGameSession({ config, seed, renderer })
        unbind = bindHudSounds(session)
        await session.start()
        if (!cancelled) cb.current.onSession(session)
      } catch (err) {
        teardown()
        if (cancelled) return
        // loadGameAssets already reported its own failure; report renderer/session ones here
        const message = err instanceof Error ? err.message : 'Could not start the game.'
        cb.current.onLoadState({ progress: 0, status: 'error', error: message, retry: () => void run(true) })
      }
    }
    void run(false)
    return () => {
      cancelled = true
      teardown()
    }
  }, [config, seed])

  return <div ref={host} style={{ width: '100%', height: '100%', overflow: 'hidden' }} />
}
