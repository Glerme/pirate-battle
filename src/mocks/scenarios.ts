import { SCENARIO_IDS } from '../api/contracts'
import type { ScenarioId } from '../api/contracts'
import { clearConfirmedMatches } from './db'

const scenarioKey = 'pirate.mockScenario'
const outageKey = 'pirate.mockOutageAttempts'
const listeners = new Set<() => void>()
const params = new URLSearchParams(globalThis.location?.search)
const seed = Number(params.get('seed') ?? 1) >>> 0

function isScenario(value: string | null): value is ScenarioId {
  return SCENARIO_IDS.some((id) => id === value)
}

function initialScenario(): ScenarioId {
  const fromUrl = params.get('scenario')
  try {
    const stored = localStorage.getItem(scenarioKey)
    if (isScenario(fromUrl)) {
      if (stored !== fromUrl) localStorage.removeItem(outageKey)
      localStorage.setItem(scenarioKey, fromUrl)
      return fromUrl
    }
    if (isScenario(stored)) return stored
  } catch {
    // Storage can be unavailable when the browser blocks persistence.
  }
  return isScenario(fromUrl) ? fromUrl : 'success'
}

let scenario = initialScenario()
let rng = seed
let requestIndex = 0
let generation = 0

export function getScenario() {
  return scenario
}

export function subscribeToScenario(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function clearScenarioParam() {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  if (!url.searchParams.has('scenario')) return
  url.searchParams.delete('scenario')
  window.history.replaceState(window.history.state, '', url)
}

function restartScenario(next: ScenarioId) {
  scenario = next
  rng = seed
  requestIndex = 0
  generation += 1
  clearScenarioParam()
  listeners.forEach((listener) => listener())
}

export function setScenario(next: ScenarioId) {
  if (!isScenario(next)) throw new RangeError('Unknown mock scenario')
  localStorage.setItem(scenarioKey, next)
  localStorage.removeItem(outageKey)
  restartScenario(next)
}

export function resetMockData() {
  clearConfirmedMatches()
  localStorage.removeItem(scenarioKey)
  localStorage.removeItem(outageKey)
  restartScenario('success')
}

export function mockRequest() {
  const index = requestIndex++
  let latencyMs = 0
  if (scenario === 'slow') latencyMs = 1500
  if (scenario === 'variable-latency') {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0
    latencyMs = 100 + (rng % 1000)
  }
  if (scenario === 'out-of-order') latencyMs = index % 2 === 0 ? 900 : 100
  return { scenario, latencyMs, generation }
}

export function isCurrentMockRequest(request: ReturnType<typeof mockRequest>) {
  return request.generation === generation
}

export function isRegistrationUnavailable() {
  const attempts = Number(localStorage.getItem(outageKey) ?? 0)
  if (attempts >= 1) return false
  localStorage.setItem(outageKey, String(attempts + 1))
  return true
}
