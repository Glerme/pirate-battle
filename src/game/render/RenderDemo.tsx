import { useRef } from 'react'
import { GameCanvas } from '../GameCanvas'
import type { GameEvent, MapData, Renderer, ShipKind, ShipState, WorldSnapshot } from '../types'

// Dev-only: renders a static fixture (all kinds x 4 damage states) and loops sample effect events.
const cols = 30, rows = 17
const tiles = Array.from({ length: cols * rows }, (_, i) => {
  const c = i % cols, r = Math.floor(i / cols)
  return c >= 22 && c < 27 && r >= 2 && r < 6 ? 4 : 73 // sand island on water
})
const map: MapData = { cols, rows, tileSize: 64, tiles, solid: tiles.map((t) => t === 4) }

const kinds: ShipKind[] = ['player', 'chaser', 'shooter']
const ships: ShipState[] = kinds.flatMap((kind, row) =>
  [10, 7, 4, 1].map((hp, col): ShipState => ({
    id: row * 4 + col + 1, kind, x: 300 + col * 300, y: 400 + row * 260, rotation: (col - 1.5) * 0.4, hp, maxHp: 10, alive: true,
  })),
)
const demoEvents: GameEvent[] = [
  { type: 'shot', weapon: 'front', shipId: 1 },
  { type: 'shot', weapon: 'left', shipId: 2 },
  { type: 'hit', targetId: 6, x: 600, y: 660 },
  { type: 'splash', x: 1000, y: 200 },
  { type: 'destroyed', shipId: 99, kind: 'chaser', x: 1400, y: 200, byPlayer: true },
]

export function RenderDemo() {
  const raf = useRef(0)
  const onRenderer = (r: Renderer | null) => {
    cancelAnimationFrame(raf.current)
    if (!r) return
    let t = 0
    const loop = () => {
      t += 16.7
      const events = t % 1500 < 16.7 ? demoEvents : []
      const world: WorldSnapshot = { map, ships, projectiles: [{ id: 1, x: 900 + (t % 600), y: 300, rotation: Math.PI / 2, faction: 'player' }], events, simTimeMs: t }
      r.render(world, 1)
      raf.current = requestAnimationFrame(loop)
    }
    loop()
  }
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <GameCanvas onRenderer={onRenderer} onProgress={(p) => p.status === 'error' && console.error(p.error)} />
    </div>
  )
}
