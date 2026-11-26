import { expect, gotoApp, test } from '../fixtures'

test.describe('08-result-persist: result display and persistence after refresh', () => {
  test('displays score, time played, end reason, and registration status, and persists after page refresh', async ({ page }) => {
    test.setTimeout(90_000)
    await gotoApp(page, { scenario: 'success', seed: 42 })

    // Set session time to 60s via Options
    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByLabel('Game session time').fill('60')
    await page.getByLabel('Enemy spawn time').fill('15')
    await page.getByLabel('Captain name').fill('Anne Bonny')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Main Menu' }).click()

    // Start match
    await page.getByRole('button', { name: 'Play' }).click()
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.status), { timeout: 15_000 }).toBe('running')

    // Hold W and D once via real keyboard input, then advance 60s on manual clock so enemies do not destroy the player before time_up
    await page.keyboard.down('KeyW')
    await page.keyboard.down('KeyD')
    await page.evaluate(() => window.__pirate?.advance(60_000))
    await page.keyboard.up('KeyW')
    await page.keyboard.up('KeyD')

    // Result screen should be displayed with Time up and 01:00 time played
    await expect(page).toHaveURL(/\/result/)
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()

    const summary = page.locator('dl.summary')
    await expect(summary).toContainText('Points')
    await expect(summary).toContainText('Time played')
    await expect(summary).toContainText('01:00')
    await expect(summary).toContainText('Result')
    await expect(summary).toContainText('Time up')
    await expect(summary).toContainText('Registration')

    // Registration completes against MSW
    const regStatus = page.locator('dd.reg[role="status"]')
    await expect(regStatus).toHaveText('Saved')

    const bigScoreText = await page.locator('.big-score').textContent()

    // Reload on /result and verify persisted result is re-displayed
    await page.reload()
    await expect(page).toHaveURL(/\/result/)
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.locator('.big-score')).toHaveText(bigScoreText ?? '0')
    await expect(page.locator('dl.summary')).toContainText('01:00')
    await expect(page.locator('dl.summary')).toContainText('Time up')
    await expect(page.locator('dd.reg[role="status"]')).toHaveText('Saved')
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Main Menu' })).toBeVisible()
  })

  test('displays Ship destroyed end reason and pending/retry registration status when server is temporarily unavailable', async ({ page }) => {
    test.setTimeout(90_000)
    await gotoApp(page, { scenario: 'unavailable-then-recover', seed: 7 })

    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByLabel('Game session time').fill('180')
    await page.getByLabel('Enemy spawn time').fill('1')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Main Menu' }).click()

    await page.getByRole('button', { name: 'Play' }).click()
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.status), { timeout: 15_000 }).toBe('running')

    // Step simulation until player ship is destroyed by enemies (stationary player is destroyed ~48s)
    for (let i = 0; i < 24; i++) {
      const status = await page.evaluate(() => {
        const s = window.__pirate?.getState()
        if (s?.status === 'running') window.__pirate?.advance(5000)
        return window.__pirate?.getState()?.status
      })
      if (status !== 'running') break
    }

    await expect(page).toHaveURL(/\/result/)
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.locator('dl.summary')).toContainText('Ship destroyed')

    // First registration attempt under unavailable-then-recover fails with 503 -> status becomes 'Pending — will retry'
    const regStatus = page.locator('dd.reg[role="status"]')
    await expect(regStatus).toHaveText('Pending — will retry')
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()

    // Refreshing on /result preserves the result and automatically retries outbox on boot -> becomes 'Saved'
    await page.reload()
    await expect(page).toHaveURL(/\/result/)
    await expect(page.locator('dl.summary')).toContainText('Ship destroyed')
    await expect(regStatus).toHaveText('Saved')
  })
})
