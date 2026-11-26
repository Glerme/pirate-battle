import { expect, type Page } from '@playwright/test'
import type { TestState } from '../../../src/game/testing'
import { gotoApp, type GotoAppOptions } from '../fixtures'

export const STEP_MS = 1000 / 60

export async function startMatch(
  page: Page,
  options: GotoAppOptions & { sessionTimeSec?: number; spawnIntervalSec?: number } = {},
): Promise<TestState> {
  const { sessionTimeSec, spawnIntervalSec, ...gotoOpts } = options
  if (sessionTimeSec !== undefined || spawnIntervalSec !== undefined) {
    await page.addInitScript(
      ({ sessionTimeSec: sTime, spawnIntervalSec: sSpawn }) => {
        if (!sessionStorage.getItem('__e2e_opts_set')) {
          localStorage.setItem(
            'pirate.options.v1',
            JSON.stringify({
              v: 1,
              data: {
                sessionTimeSec: sTime ?? 120,
                spawnIntervalSec: sSpawn ?? 4,
                captainName: 'Captain',
              },
            }),
          )
          sessionStorage.setItem('__e2e_opts_set', '1')
        }
      },
      { sessionTimeSec, spawnIntervalSec },
    )
  }
  await gotoApp(page, { seed: 42, ...gotoOpts })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect
    .poll(async () => page.evaluate(() => window.__pirate?.getState()?.status ?? null), { timeout: 15_000 })
    .toBe('running')
  return getState(page)
}

export async function getState(page: Page): Promise<TestState> {
  const state = await page.evaluate(() => window.__pirate?.getState() ?? null)
  if (!state) throw new Error('window.__pirate.getState() returned null')
  return state
}

export async function advance(page: Page, ms: number): Promise<TestState> {
  await page.evaluate((dt) => window.__pirate?.advance(dt), ms)
  return getState(page)
}

export async function setSeed(page: Page, seed: number): Promise<void> {
  await page.evaluate((s) => window.__pirate?.setSeed(s), seed)
}
