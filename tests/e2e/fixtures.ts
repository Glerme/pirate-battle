import { test as base, expect, type Page } from '@playwright/test'

export interface GotoAppOptions {
  /** MSW scenario id (see ScenarioId in src/api/contracts.ts). */
  scenario?: string
  /** Deterministic RNG seed for the simulation / mock latency. */
  seed?: number | string
  /** Enable window.__pirate test instrumentation (default true). */
  test?: boolean
  /** Route to open (default '/'). */
  path?: string
}

/** Opens the app with `?scenario=&seed=&test=1`. */
export async function gotoApp(page: Page, { scenario, seed, test = true, path = '/' }: GotoAppOptions = {}) {
  const q = new URLSearchParams()
  if (scenario) q.set('scenario', scenario)
  if (seed !== undefined) q.set('seed', String(seed))
  if (test) q.set('test', '1')
  const qs = q.toString()
  await page.goto(qs ? `${path}?${qs}` : path)
}

/** Fresh context per test (Playwright default) plus cleared localStorage before app scripts run. */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      // Only clear on first load of the context, so reloads inside a test keep persisted state.
      if (!sessionStorage.getItem('__e2e_cleared')) {
        localStorage.clear()
        sessionStorage.setItem('__e2e_cleared', '1')
      }
    })
    await use(page)
  },
})

export { expect }
