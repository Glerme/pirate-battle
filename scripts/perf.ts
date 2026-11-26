/// <reference lib="dom" />
/**
 * Performance run on the production preview build (`pnpm perf`; builds first if dist/ is missing).
 *  1. One real-time 180 s match played by an input bot. The URL carries `perf=1`, a measurement-only knob that gives the player
 *     huge HP (see perfConfig in src/game/testing.ts) so the bot survives the whole match; normal play is unaffected.
 *     Collects avg FPS, p95 frame time (rAF deltas, only while the match is running) and entity counts over time.
 *  2. 5 start → play → exit cycles with forced GC: JSHeapUsedSize, event listeners, Pixi display objects/textures.
 * Writes docs/perf/report.md and docs/perf/report.json.
 */
import { spawn, execSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import { chromium, type Page } from '@playwright/test'
import type {} from '../src/game/testing'

const PORT = 4175
// PERF_SMOKE=<base url> (e.g. http://localhost:4173): short validation run against an already-running server; writes no report.
const SMOKE = process.env.PERF_SMOKE
const BASE = SMOKE ?? `http://localhost:${PORT}`
const TARGET_PLAY_MS = SMOKE ? 15_000 : 180_000
const CYCLES = SMOKE ? 2 : 5
const CYCLE_PLAY_MS = SMOKE ? 2_000 : 8_000
const OPTIONS = { sessionTimeSec: 180, spawnIntervalSec: 2, captainName: 'PerfBot' }
const VIEWPORT = { width: 1280, height: 720 }

declare global {
  interface Window {
    __frames?: number[]
    __rec?: boolean
    __PIXI_APP__?: { stage: unknown; renderer: { texture?: { managedTextures?: unknown[] } } }
  }
}

if (!SMOKE && !existsSync('dist/index.html')) execSync('pnpm build', { stdio: 'inherit' })
const server = SMOKE ? undefined : spawn('pnpm', ['preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
for (let i = 0; ; i++) {
  try { if ((await fetch(BASE)).ok) break } catch { /* not up yet */ }
  if (i > 60) throw new Error('preview server did not start')
  await new Promise((r) => setTimeout(r, 500))
}

const browser = await chromium.launch({
  args: ['--enable-precise-memory-info', '--js-flags=--expose-gc', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
})
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 })
await context.addInitScript((opts) => {
  localStorage.setItem('pirate.options.v1', JSON.stringify({ v: 1, data: opts }))
  window.__frames = []
  const raf = window.requestAnimationFrame.bind(window)
  let last = 0
  window.requestAnimationFrame = (cb) => raf((t) => {
    // Sample only while __rec is on; resetting `last` otherwise keeps menu/result transition gaps out. t === last: second rAF callback of the same frame.
    if (!window.__rec) last = 0
    else if (t !== last) { if (last) window.__frames!.push(t - last); last = t }
    cb(t)
  })
}, OPTIONS)
const page = await context.newPage()
const errors: string[] = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
const cdp = await context.newCDPSession(page)
await cdp.send('Performance.enable')

type Key = 'w' | 'a' | 'd' | ' ' | 'q' | 'e'
const held = new Set<Key>()
async function setKeys(want: Set<Key>) {
  for (const k of [...held]) if (!want.has(k)) { await page.keyboard.up(k); held.delete(k) }
  for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k) }
}

/** Steers at the nearest enemy, fires the front gun when aligned and a broadside when it is abeam. */
async function botStep(): Promise<{ status: string; ships: number; projectiles: number; simTimeMs: number } | null> {
  const s = await page.evaluate(() => {
    const st = window.__pirate?.getState()
    if (!st) return null
    const me = st.ships.find((x) => x.kind === 'player')
    const foes = st.ships.filter((x) => x.kind !== 'player' && x.alive)
    return { status: st.status, simTimeMs: st.simTimeMs, me: me && { x: me.x, y: me.y, r: me.rotation }, foes: foes.map((f) => ({ x: f.x, y: f.y })), ships: st.ships.length, projectiles: st.projectiles.length }
  })
  if (!s) return null
  const keys = new Set<Key>()
  if (s.me && s.status === 'running') {
    const foe = s.foes.map((f) => ({ ...f, d: Math.hypot(f.x - s.me!.x, f.y - s.me!.y) })).sort((a, b) => a.d - b.d)[0]
    if (!foe) keys.add('w')
    else {
      const want = Math.atan2(foe.x - s.me.x, -(foe.y - s.me.y))
      let diff = want - s.me.r
      diff = Math.atan2(Math.sin(diff), Math.cos(diff))
      if (Math.abs(diff) > 0.15) keys.add(diff > 0 ? 'd' : 'a')
      if (foe.d > 260) keys.add('w')
      if (Math.abs(diff) < 0.25 && foe.d < 520) keys.add(' ')
      else if (foe.d < 380 && Math.abs(Math.abs(diff) - Math.PI / 2) < 0.3) keys.add(diff > 0 ? 'e' : 'q')
    }
  }
  await setKeys(keys)
  return { status: s.status, ships: s.ships, projectiles: s.projectiles, simTimeMs: s.simTimeMs }
}

async function startPlay(reload = true) {
  await page.evaluate(() => { window.__rec = false }).catch(() => undefined)
  if (reload) await page.goto(`${BASE}/?inspect=1&perf=1`)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.waitForFunction(() => window.__pirate?.getState()?.status === 'running', null, { timeout: 30_000 })
  await page.evaluate(() => { window.__rec = true })
}

// Evaluated as a string: tsx would inject its `__name` helper into a function body, which does not exist in the page.
const PIXI_COUNTS = `(() => {
  const app = window.__PIXI_APP__
  if (!app) return { displayObjects: 0, textures: 0 }
  let n = 0
  const walk = (c) => { n++; (c.children || []).forEach(walk) }
  walk(app.stage)
  return { displayObjects: n, textures: app.renderer.texture?.managedTextures?.length ?? -1 }
})()`
const pixiCounts = (p: Page) => p.evaluate<{ displayObjects: number; textures: number }>(PIXI_COUNTS)

// ---- 1. long match ----
let playedMs = 0
let matches = 0
const samples: { tSec: number; ships: number; projectiles: number; displayObjects: number }[] = []
await startPlay()
await page.evaluate(() => { window.__frames!.length = 0 })
while (playedMs < TARGET_PLAY_MS) {
  const t0 = Date.now()
  let lastSim = 0
  let sampleAt = 0
  while (playedMs + lastSim < TARGET_PLAY_MS) {
    const s = await botStep()
    if (!s || s.status === 'ended' || page.url().includes('/result')) break
    lastSim = s.simTimeMs
    if (Date.now() - sampleAt >= 1000) {
      sampleAt = Date.now()
      samples.push({ tSec: Math.round((playedMs + lastSim) / 1000), ships: s.ships - 1, projectiles: s.projectiles, displayObjects: (await pixiCounts(page)).displayObjects })
    }
    await page.waitForTimeout(100 - Math.min(90, (Date.now() - t0) % 100))
  }
  await page.evaluate(() => { window.__rec = false })
  playedMs += lastSim
  matches++
  if (playedMs >= TARGET_PLAY_MS) break
  await setKeys(new Set())
  await page.waitForURL('**/result', { timeout: 10_000 }).catch(() => undefined)
  await page.getByRole('button', { name: 'Play Again' }).click()
  await page.waitForFunction(() => window.__pirate?.getState()?.status === 'running', null, { timeout: 30_000 })
}
await setKeys(new Set())
const frames = await page.evaluate(() => window.__frames!.slice())
const sorted = [...frames].sort((a, b) => a - b)
const sum = frames.reduce((a, b) => a + b, 0)
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0
const long = {
  matches,
  playedSec: Math.round(playedMs / 1000),
  frames: frames.length,
  avgFps: +(1000 / (sum / frames.length)).toFixed(1),
  avgFrameMs: +(sum / frames.length).toFixed(2),
  p50FrameMs: +pct(0.5).toFixed(2),
  p95FrameMs: +pct(0.95).toFixed(2),
  p99FrameMs: +pct(0.99).toFixed(2),
  maxFrameMs: +(sorted.at(-1) ?? 0).toFixed(2),
  enemiesAvg: +(samples.reduce((a, s) => a + s.ships, 0) / Math.max(1, samples.length)).toFixed(1),
  enemiesMax: Math.max(0, ...samples.map((s) => s.ships)),
  projectilesAvg: +(samples.reduce((a, s) => a + s.projectiles, 0) / Math.max(1, samples.length)).toFixed(1),
  projectilesMax: Math.max(0, ...samples.map((s) => s.projectiles)),
  displayObjectsAvg: Math.round(samples.reduce((a, s) => a + s.displayObjects, 0) / Math.max(1, samples.length)),
  displayObjectsMax: Math.max(0, ...samples.map((s) => s.displayObjects)),
}

// ---- 2. start-play-exit cycles ----
async function metrics(): Promise<Record<string, number>> {
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
}
const cycles: { cycle: number; heapMB: number; listeners: number; nodes: number; midPlay: { displayObjects: number; textures: number }; afterExit: { displayObjects: number; textures: number; canvases: number } }[] = []
for (let i = 1; i <= CYCLES; i++) {
  await startPlay(i === 1) // later cycles stay in the SPA so leaks accumulate
  const t0 = Date.now()
  while (Date.now() - t0 < CYCLE_PLAY_MS) { await botStep(); await page.waitForTimeout(100) }
  const midPlay = await pixiCounts(page)
  await setKeys(new Set())
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Main Menu' }).click()
  await page.waitForURL(`${BASE}/**`)
  await page.waitForTimeout(500)
  const m = await metrics()
  const after = { ...(await pixiCounts(page)), canvases: await page.locator('canvas').count() }
  cycles.push({ cycle: i, heapMB: +((m.JSHeapUsedSize ?? 0) / 2 ** 20).toFixed(2), listeners: m.JSEventListeners ?? -1, nodes: m.Nodes ?? -1, midPlay, afterExit: after })
}

const gpu = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl')
  const ext = gl?.getExtension('WEBGL_debug_renderer_info')
  return gl && ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown'
})
const hardware = { cpu: os.cpus()[0]?.model ?? 'unknown', cores: os.cpus().length, memGB: +(os.totalmem() / 2 ** 30).toFixed(1), os: `${os.type()} ${os.release()}`, gpu }
const report = {
  generatedAt: new Date().toISOString(), hardware, browser: `Chromium ${browser.version()} (headless, Playwright)`, resolution: { ...VIEWPORT, devicePixelRatio: 1 },
  matchConfig: { ...OPTIONS, note: 'spawn interval 2 s (stress; default is 4 s), other values from DEFAULT_GAME_CONFIG' },
  longRun: long, entityCountsOverTime: samples, cycles, consoleErrors: errors,
}
if (SMOKE) {
  console.log(JSON.stringify({ long, cycles, errors }, null, 1))
  await browser.close()
  process.exit(0)
}
mkdirSync('docs/perf', { recursive: true })
writeFileSync('docs/perf/report.json', JSON.stringify(report, null, 2) + '\n')
const heapDelta = (cycles.at(-1)?.heapMB ?? 0) - (cycles[0]?.heapMB ?? 0)
writeFileSync('docs/perf/report.md', `# Performance report

Generated by \`pnpm perf\` (\`scripts/perf.ts\`) on ${report.generatedAt}. Raw data: \`report.json\`.

## Environment
- Hardware: ${hardware.cpu}, ${hardware.cores} threads, ${hardware.memGB} GB RAM, ${hardware.os}
- Browser: ${report.browser}
- WebGL renderer: ${gpu}
- Viewport: ${VIEWPORT.width}×${VIEWPORT.height} @ DPR 1 (production \`vite preview\` build, MSW mocks on)
- Match config: session ${OPTIONS.sessionTimeSec} s, spawn interval ${OPTIONS.spawnIntervalSec} s (stress; default is 4 s), maxAlive 8, rest = \`DEFAULT_GAME_CONFIG\`
- Measurement-only knob: \`?inspect=1&perf=1\` gives the player 1,000,000 HP so the bot survives the full match (needs both params; never active in normal play). Enemies still fire and spawn normally.
- Input bot: aims at the nearest enemy, fires the front gun when aligned and a broadside when abeam (sampled every 100 ms)

## Long run (${long.playedSec} s of simulated play over ${long.matches} match${long.matches > 1 ? 'es' : ''}; frames sampled only while the match is running)
| Metric | Value |
|---|---|
| Frames measured | ${long.frames} |
| Average FPS | ${long.avgFps} |
| Frame time avg / p50 / p95 / p99 / max (ms) | ${long.avgFrameMs} / ${long.p50FrameMs} / ${long.p95FrameMs} / ${long.p99FrameMs} / ${long.maxFrameMs} |
| Live enemies avg / max | ${long.enemiesAvg} / ${long.enemiesMax} |
| Live projectiles avg / max | ${long.projectilesAvg} / ${long.projectilesMax} |
| Pixi display objects (ships, projectiles, effects, map, HUD layers) avg / max | ${long.displayObjectsAvg} / ${long.displayObjectsMax} |

Entity counts over time (every ~1 s: seconds, enemies, projectiles, display objects) are in \`report.json\` → \`entityCountsOverTime\`.

## Start → play → exit cycles (${CYCLES}×, ${CYCLE_PLAY_MS / 1000} s of play each, GC forced twice before each reading)
| Cycle | JS heap (MB) | Event listeners | DOM nodes | Pixi objects / textures mid-play | Pixi objects / textures / canvases after exit |
|---|---|---|---|---|---|
${cycles.map((c) => `| ${c.cycle} | ${c.heapMB} | ${c.listeners} | ${c.nodes} | ${c.midPlay.displayObjects} / ${c.midPlay.textures} | ${c.afterExit.displayObjects} / ${c.afterExit.textures} / ${c.afterExit.canvases} |`).join('\n')}

Heap drift cycle 1 → ${CYCLES}: ${heapDelta >= 0 ? '+' : ''}${heapDelta.toFixed(2)} MB. Console errors during the run: ${errors.length}.

## Limitations
- Headless Chromium with software WebGL (SwiftShader): FPS/frame times are CPU-rendered and not representative of a real GPU; relative trends (heap, object counts) are what matter.
- Frame times are rAF deltas inside the page, so they include the bot's \`page.evaluate\` polling overhead.
- The bot is not a player: entity counts depend on how well it kills enemies (with the HP knob it cannot die, so load may differ from a human match). Single machine, single run; no DevTools trace is recorded.
- Pixi texture count is \`renderer.texture.managedTextures\` (GPU-uploaded textures); atlas textures stay cached between matches by design.
`)
console.log(JSON.stringify({ long, cycles, errors }, null, 1))
await browser.close()
server?.kill()
