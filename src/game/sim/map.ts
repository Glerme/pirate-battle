import type { MapData } from '../types'

const cols = 30
const rows = 17
const tileSize = 64
const tiles = Array<number>(cols * rows).fill(73)
const solid = Array<boolean>(tiles.length).fill(false)

const islands = [
  { col: 5, row: 6, tiles: [
    [6, 7, 8, 9],
    [22, 23, 24, 25],
    [38, 39, 40, 41],
    [54, 55, 56, 57],
  ] },
  { col: 21, row: 4, tiles: [
    [1, 2, 3],
    [17, 18, 19],
    [33, 34, 35],
  ] },
]

export const islandRects = islands.map((island) => {
  island.tiles.forEach((row, y) => row.forEach((tile, x) => {
    const index = (island.row + y) * cols + island.col + x
    tiles[index] = tile
    solid[index] = true
  }))
  return {
    left: island.col * tileSize,
    right: (island.col + (island.tiles[0]?.length ?? 0)) * tileSize,
    top: island.row * tileSize,
    bottom: (island.row + island.tiles.length) * tileSize,
  }
})

export const map: MapData = Object.freeze({
  cols, rows, tileSize, tiles: Object.freeze(tiles), solid: Object.freeze(solid),
})

export const spawnPoints = [
  { x: 192, y: 192 }, { x: 640, y: 192 }, { x: 960, y: 160 },
  { x: 1216, y: 176 }, { x: 1696, y: 176 }, { x: 1760, y: 544 },
  { x: 1728, y: 896 }, { x: 1216, y: 928 }, { x: 640, y: 928 },
  { x: 192, y: 896 }, { x: 160, y: 544 },
]
