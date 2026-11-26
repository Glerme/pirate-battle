import { expect, gotoApp, test } from '../fixtures'
import { getState } from './helpers'

test.describe('02 - Asset loading, error handling and retry', () => {
  test('shows error alert when atlas request is aborted and recovers on Retry to start combat', async ({ page }) => {
    let shouldAbort = true
    await page.context().route('**/assets/ships_miscellaneous_sheet*.json', async (route) => {
      if (shouldAbort) {
        await route.abort('failed')
      } else {
        await route.continue()
      }
    })

    await gotoApp(page, { seed: 42 })
    await page.getByRole('button', { name: 'Play', exact: true }).click()

    // Wait until the final error state (which carries the retry callback) settles after StrictMode mounts
    const alert = page.locator('.overlay[role="alert"]')
    await expect(alert).toBeVisible()
    await expect(alert).toContainText('Could not load the game assets')
    await page.waitForTimeout(100)

    // Combat must not have started while assets failed to load
    const failedState = await page.evaluate(() => window.__pirate?.getState() ?? null)
    expect(failedState).toBeNull()

    // Allow requests through and trigger Retry
    shouldAbort = false
    await alert.getByRole('button', { name: 'Retry' }).click()

    await expect
      .poll(async () => page.evaluate(() => window.__pirate?.getState()?.status ?? null), { timeout: 15_000 })
      .toBe('running')

    const state = await getState(page)
    expect(state.status).toBe('running')
    expect(state.ships).toHaveLength(1)
    expect(state.ships[0]?.kind).toBe('player')
  })
})
