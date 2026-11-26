// Run with pnpm exec tsx src/game/sim/self-check.mjs.
import assert from 'node:assert/strict'
import { createMatchConfig } from '../config.ts'
import { islandHit, nearIsland } from './geometry.ts'
import { MAX_FRAME_MS, Simulation, STEP_MS } from './index.ts'

const config = createMatchConfig({ sessionTimeSec: 60, spawnIntervalSec: 4 })
const idle = new Set()
const seed = 42

function play(survive, frameMs) {
  const sim = new Simulation(config, seed)
  for (let i = 0; i < 600 && !sim.endReason; i++) {
    const controls = survive ? new Set(['forward', 'fireFront', 'fireLeft', 'fireRight']) : idle
    if (survive && i % 20 > 15) controls.add('turnRight')
    for (let elapsed = 0; elapsed < 100 && !sim.endReason; elapsed += frameMs) {
      sim.advance(frameMs, controls)
    }
  }

  const state = structuredClone(sim.snapshot)
  const spawns = state.events.filter((event) => event.type === 'spawn')
  assert.deepEqual(spawns.slice(0, 2).map((event) => event.kind), ['chaser', 'shooter'])
  assert.equal(sim.score, state.events.filter((event) => event.type === 'destroyed' && event.byPlayer).length)
  assert.ok(state.events.some((event) => event.type === 'chaserRam'))
  assert.ok(state.events.some((event) => event.type === 'shot' && event.weapon === 'enemy'))
  assert.equal(state.events.filter((event) => event.type === 'matchEnded').length, 1)
  sim.advance(MAX_FRAME_MS, new Set(['forward', 'fireFront']))
  assert.deepEqual(sim.snapshot, state)
  return { reason: sim.endReason, score: sim.score, state }
}

const win = play(true, 100)
assert.equal(win.reason, 'time_up')
assert.equal(win.state.simTimeMs, 60_000)
assert.ok(win.score > 0)
assert.deepEqual(play(true, 25), win)
const loss = play(false, 100)
assert.equal(loss.reason, 'destroyed')
assert.equal(loss.score, 0)
assert.equal(loss.state.ships[0].hp, 0)
assert.deepEqual(play(false, 25), loss)

const weapons = new Simulation(config, seed)
weapons.advance(STEP_MS, new Set(['fireFront', 'fireLeft']))
assert.equal(weapons.snapshot.projectiles.length, 4)
weapons.clearEvents()
weapons.advance(STEP_MS, new Set(['fireFront', 'fireLeft', 'fireRight']))
assert.equal(weapons.snapshot.projectiles.length, 7)
assert.deepEqual(weapons.snapshot.events.map((event) => event.weapon), ['right'])
weapons.advance(120_000, idle)
assert.equal(weapons.simTimeMs, 17 * 1000 / 60)

function drive(sim, ms, ...actions) {
  const input = new Set(actions)
  while (ms > 0) {
    const elapsed = Math.min(ms, MAX_FRAME_MS)
    sim.advance(elapsed, input)
    ms -= elapsed
  }
}
const navigation = new Simulation(config, seed)
drive(navigation, 1600, 'forward')
drive(navigation, 650, 'turnLeft')
drive(navigation, 3250, 'forward', 'fireFront')
const ship = navigation.snapshot.ships[0]
assert.ok(ship.x >= 576 + config.ships.player.radius - 1e-8)
assert.equal(nearIsland(ship, config.ships.player.radius - 1e-8), false)
assert.ok(navigation.snapshot.events.some(({ type }) => type === 'splash'))
assert.ok(islandHit({ x: 750, y: 500 }, { x: -500, y: 0 }) < 1)

globalThis.Element = class {
  closest() { return this }
}
globalThis.window = Object.assign(new EventTarget(), { location: { search: '?test=1&seed=42' } })
globalThis.document = Object.assign(new EventTarget(), { hidden: false, activeElement: null })
const { createGameSession } = await import('../session.ts')
const test = window.__pirate
assert.equal(test.manualClock, true)
test.setSeed(seed)
let renders = 0
const session = createGameSession({
  config,
  seed: 99,
  renderer: { async init() {}, render() { renders++ }, resize() {}, destroy() {} },
})
let hudUpdates = 0
session.hud.subscribe(() => hudUpdates++)
await session.start()
test.advance(STEP_MS / 2)
assert.equal(hudUpdates, 1)
function keyboard(type, key, code) {
  const event = Object.assign(new Event(type, { cancelable: true }), { key, code })
  window.dispatchEvent(event)
  return event.defaultPrevented
}
assert.equal(keyboard('keydown', 'z', 'KeyZ'), false)
const inputField = new Element()
document.activeElement = inputField
document.dispatchEvent(Object.assign(new Event('focusout'), { relatedTarget: inputField }))
assert.equal(keyboard('keydown', 'w', 'KeyW'), false)
document.activeElement = null
document.dispatchEvent(Object.assign(new Event('focusout'), { relatedTarget: null }))
assert.equal(keyboard('keydown', 'p', 'KeyP'), true)
assert.equal(test.getState().pauseReason, 'manual')
assert.equal(keyboard('keydown', 'w', 'KeyW'), false)
session.resume()
assert.equal(keyboard('keydown', 'w', 'KeyW'), true)
session.input.press('forward')
window.dispatchEvent(new Event('blur'))
assert.equal(test.getState().pauseReason, 'blur')
const pausedRenders = renders
test.advance(5000)
assert.equal(renders, pausedRenders)
assert.equal(test.getState().simTimeMs, 0)

session.resume()
test.advance(STEP_MS / 2)
assert.equal(test.getState().simTimeMs, 0)
test.advance(STEP_MS / 2)
assert.equal(test.getState().ships[0].y, loss.state.ships[0].y)
document.hidden = true
document.dispatchEvent(new Event('visibilitychange'))
assert.equal(test.getState().pauseReason, 'hidden')
document.hidden = false
document.dispatchEvent(new Event('visibilitychange'))
assert.equal(test.getState().status, 'paused')
session.resume()

let result
let results = 0
session.onEnd((match) => {
  result = match
  results++
})
test.advance(60_000)
assert.equal(result.endReason, 'destroyed')
assert.equal(result.durationMs, Math.round(loss.state.simTimeMs))
assert.equal(test.getState().status, 'ended')
test.advance(60_000)
assert.equal(results, 1)
session.destroy()
assert.equal(test.getState(), null)

console.log(`Seed ${seed}: time_up at ${win.state.simTimeMs} ms (score ${win.score}), destroyed at ${Math.round(loss.state.simTimeMs)} ms`)
