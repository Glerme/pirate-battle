// Converts the challenge's Starling XML / tile grid into Pixi spritesheet JSON and copies runtime assets to public/assets.
// Run: pnpm atlas. Output is committed.
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = 'assets'
const OUT = 'public/assets'
const TILE = 64
const TILE_COUNT = 96

interface Frame {
  frame: { x: number; y: number; w: number; h: number }
  rotated: false
  trimmed: false
  spriteSourceSize: { x: number; y: number; w: number; h: number }
  sourceSize: { w: number; h: number }
}

const frameOf = (x: number, y: number, w: number, h: number): Frame => ({
  frame: { x, y, w, h },
  rotated: false,
  trimmed: false,
  spriteSourceSize: { x: 0, y: 0, w, h },
  sourceSize: { w, h },
})

function pngSize(path: string) {
  const b = readFileSync(path)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

/** Retina (`@2x`) sheets keep the same frame names; Pixi derives resolution from meta.scale. */
function writeSheet(name: string, frames: Record<string, Frame>, image: string, scale: number, size: { w: number; h: number }) {
  const json = { frames, meta: { image, format: 'RGBA8888', size, scale: String(scale) } }
  writeFileSync(join(OUT, name), JSON.stringify(json))
}

function convertStarling(xmlPath: string, outName: string, outImage: string, scale: number) {
  const xml = readFileSync(xmlPath, 'utf8')
  const frames: Record<string, Frame> = {}
  for (const m of xml.matchAll(/<SubTexture\s+([^>]*?)\/>/g)) {
    const a = Object.fromEntries([...m[1]!.matchAll(/(\w+)="([^"]*)"/g)].map((p) => [p[1]!, p[2]!]))
    // Strip ".png" so frames are addressed as `ship_1`, `explosion_1`, ...
    frames[a.name!.replace(/\.png$/, '')] = frameOf(+a.x!, +a.y!, +a.width!, +a.height!)
  }
  writeSheet(outName, frames, outImage, scale, pngSize(join(OUT, outImage)))
  return Object.keys(frames).length
}

function tileGrid(outName: string, outImage: string, scale: number) {
  const size = pngSize(join(OUT, outImage))
  const t = TILE * scale
  const cols = size.w / t
  const frames: Record<string, Frame> = {}
  for (let i = 0; i < TILE_COUNT; i++) {
    frames[`tile_${i + 1}`] = frameOf((i % cols) * t, Math.floor(i / cols) * t, t, t)
  }
  writeSheet(outName, frames, outImage, scale, size)
}

mkdirSync(OUT, { recursive: true })
cpSync(join(SRC, 'sounds'), join(OUT, 'sounds'), { recursive: true })
copyFileSync(join(SRC, 'ui_scene_background.png'), join(OUT, 'ui_scene_background.png'))

const pairs: [string, string][] = [
  [join(SRC, 'spritesheet/ships_miscellaneous_sheet.png'), 'ships_miscellaneous_sheet.png'],
  [join(SRC, 'spritesheet/ships_miscellaneous_sheet_retina.png'), 'ships_miscellaneous_sheet@2x.png'],
  [join(SRC, 'tilesheet/tiles_sheet.png'), 'tiles_sheet.png'],
  [join(SRC, 'tilesheet/tiles_sheet_retina.png'), 'tiles_sheet@2x.png'],
  [join(SRC, 'spritesheet/ui_sheet.png'), 'ui_sheet.png'],
  [join(SRC, 'spritesheet/ui_sheet_retina.png'), 'ui_sheet@2x.png'],
]
for (const [from, to] of pairs) copyFileSync(from, join(OUT, to))

// The shipped "retina" ships sheet has the same pixel size as 1x, so its scale is 1 (derived, not assumed).
const shipsScale2 = pngSize(join(OUT, 'ships_miscellaneous_sheet@2x.png')).w / pngSize(join(OUT, 'ships_miscellaneous_sheet.png')).w
const n1 = convertStarling(join(SRC, 'spritesheet/ships_miscellaneous_sheet.xml'), 'ships_miscellaneous_sheet.json', 'ships_miscellaneous_sheet.png', 1)
const n2 = convertStarling(join(SRC, 'spritesheet/ships_miscellaneous_sheet_retina.xml'), 'ships_miscellaneous_sheet@2x.json', 'ships_miscellaneous_sheet@2x.png', shipsScale2)
tileGrid('tiles_sheet.json', 'tiles_sheet.png', 1)
tileGrid('tiles_sheet@2x.json', 'tiles_sheet@2x.png', 2)

// UI sheets are already Pixi JSON; only repoint meta.image at the copied (renamed) PNG.
for (const [src, out, img] of [
  ['ui_sheet.json', 'ui_sheet.json', 'ui_sheet.png'],
  ['ui_sheet_retina.json', 'ui_sheet@2x.json', 'ui_sheet@2x.png'],
] as const) {
  const j = JSON.parse(readFileSync(join(SRC, 'spritesheet', src), 'utf8'))
  j.meta.image = img
  writeFileSync(join(OUT, out), JSON.stringify(j))
}

console.log(`atlas: ships ${n1}/${n2} frames, ships@2x scale ${shipsScale2}, tiles ${TILE_COUNT}`)
