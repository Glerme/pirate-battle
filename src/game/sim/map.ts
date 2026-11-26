import type { MapData, MapStamp } from '../types'

const tileSize = 64
const GRASS_ISLAND = [[6, 7, 8, 9], [22, 23, 24, 25], [38, 39, 40, 41], [54, 55, 56, 57]] as const
const SAND_ISLAND = [[1, 2, 3], [17, 18, 19], [33, 34, 35]] as const
const ROCK = [[50]] as const
const MOSSY_ROCK = [[66]] as const
const PALM = [[71]] as const
const BUSH = [[72]] as const
const FERN = [[70]] as const

const stamp = (tiles: MapStamp['tiles'], x: number, y: number, scale = 1): MapStamp => ({ tiles, x, y, scale })
const size = (s: MapStamp) => ({ w: (s.tiles[0]?.length ?? 0) * tileSize * s.scale, h: s.tiles.length * tileSize * s.scale })

/** Collider = stamp bounds shrunk by `inset` (fraction of the size) so rounded art edges do not block early. */
const collider = (s: MapStamp, inset: number) => {
  const { w, h } = size(s)
  return { left: s.x + w * inset, right: s.x + w * (1 - inset), top: s.y + h * inset, bottom: s.y + h * (1 - inset) }
}

const westIsland = stamp(GRASS_ISLAND, 280, 260, 1.75)
const northIsland = stamp(SAND_ISLAND, 1240, 300, 1.75)
const southIsland = stamp(GRASS_ISLAND, 1500, 780)
const rockSW = stamp(ROCK, 388, 848)
const rockN = stamp(MOSSY_ROCK, 1048, 240)

/** Solid obstacles for ships and projectiles. Index 0 is the west island (used by the collision e2e test). */
export const islandRects = [
  collider(westIsland, 0.07),
  collider(northIsland, 0.08),
  collider(southIsland, 0.07),
  collider(rockSW, 0.16),
  collider(rockN, 0.16),
]

export const map: MapData = Object.freeze({
  width: 1920,
  height: 1088,
  tileSize,
  seaTile: 73,
  stamps: Object.freeze([
    westIsland, northIsland, southIsland, rockSW, rockN,
    // decoration only (not colliders)
    stamp(PALM, 400, 380, 1.3), stamp(BUSH, 560, 540, 1.2), stamp(FERN, 360, 560),
    stamp(PALM, 1560, 860), stamp(BUSH, 1380, 420),
  ]),
})

export const spawnPoints = [
  { x: 192, y: 192 }, { x: 640, y: 192 }, { x: 960, y: 160 },
  { x: 1216, y: 176 }, { x: 1696, y: 176 }, { x: 1760, y: 544 },
  { x: 1840, y: 680 }, { x: 1216, y: 928 }, { x: 640, y: 928 },
  { x: 192, y: 896 }, { x: 160, y: 544 },
]
