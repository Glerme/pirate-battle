import type { HudSnapshot, WorldSnapshot } from './types'

export type TestState = WorldSnapshot & HudSnapshot

interface TestSession {
  getState(): TestState
  advance(ms: number): void
  setSeed(seed: number): void
}

interface PirateTesting {
  getState(): TestState | null
  advance(ms: number): void
  setSeed(seed: number): void
  readonly manualClock: boolean
}

declare global {
  interface Window {
    __pirate?: PirateTesting
  }
}

const params = typeof window === 'undefined' ? null : new URLSearchParams(window.location.search)
export const manualClock = params?.get('test') === '1'
/** `?inspect=1`: expose window.__pirate (read-only use: getState) with the real-time loop untouched. Used by scripts/perf.ts. */
const inspect = manualClock || params?.get('inspect') === '1'
const querySeed = params?.get('seed')
let testSeed = querySeed && querySeed.trim() && Number.isFinite(Number(querySeed)) ? Number(querySeed) : undefined
let session: TestSession | undefined

if (inspect) {
  window.__pirate = {
    manualClock,
    getState: () => session ? structuredClone(session.getState()) : null,
    advance: (ms) => session?.advance(ms),
    setSeed: (seed) => {
      if (!Number.isFinite(seed)) return
      testSeed = seed
      session?.setSeed(seed)
    },
  }
}

export const resolveSeed = (seed: number): number => manualClock ? testSeed ?? seed : seed

export function bindTesting(active: TestSession): () => void {
  if (inspect) session = active
  return () => {
    if (session === active) session = undefined
  }
}
