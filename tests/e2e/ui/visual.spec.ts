import { expect, gotoApp, test } from '../fixtures'

test.describe('visual regression: main menu, arena in stable state, and result screen', () => {
  test('main menu visual baseline', async ({ page }) => {
    await gotoApp(page, { scenario: 'success', seed: 12345 })

    // Wait for title image and ranking table data to settle
    await expect(page.getByRole('img', { name: 'Pirate Battle' })).toBeVisible()
    await expect(page.getByRole('table', { name: 'Ranking' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Captain 6' })).toBeVisible()

    await expect(page).toHaveScreenshot('main-menu.png', {
      maxDiffPixelRatio: 0.01,
    })
  })

  test('arena in stable state with seed and manual clock visual baseline', async ({ page }) => {
    await gotoApp(page, { scenario: 'success', seed: 12345 })

    await page.getByRole('button', { name: 'Play' }).click()
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.status), { timeout: 15_000 }).toBe('running')
    await expect(page.locator('.overlay')).toHaveCount(0)

    // Advance exactly 4000ms on the manual clock so the first deterministic enemy spawns and renders
    await page.evaluate(() => window.__pirate?.advance(4000))
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.ships.length)).toBe(2)

    await expect(page).toHaveScreenshot('arena-stable.png', {
      maxDiffPixelRatio: 0.01,
    })
  })

  test('result screen visual baseline', async ({ page }) => {
    test.setTimeout(90_000)
    await gotoApp(page, { scenario: 'success', seed: 12345 })

    await page.getByRole('button', { name: 'Play' }).click()
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.status), { timeout: 15_000 }).toBe('running')

    // Advance full 120s match duration to reach the Result screen deterministically
    await page.evaluate(() => window.__pirate?.advance(120_000))
    await expect(page).toHaveURL(/\/result/)
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.locator('dd.reg[role="status"]')).toHaveText('Saved')

    await expect(page).toHaveScreenshot('result-screen.png', {
      maxDiffPixelRatio: 0.01,
    })
  })
})
