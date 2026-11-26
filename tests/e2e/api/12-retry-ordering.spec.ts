import { test, expect, gotoApp } from '../fixtures'

test.describe('12 - Idempotent retry and out-of-order responses', () => {
  test.setTimeout(60_000)

  test('register-timeout-after-commit: repeated Retry recovers existing record and produces a single entry', async ({ page }) => {
    await gotoApp(page, { scenario: 'register-timeout-after-commit', seed: 303 })

    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByLabel('Game session time').fill('60')
    await page.getByLabel('Captain name').fill('CalicoJack')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Main Menu' }).click()

    await page.getByRole('button', { name: 'Play' }).click()
    await page.waitForFunction(() => window.__pirate?.getState()?.status === 'running')
    await page.keyboard.press('Space')
    await page.evaluate(() => window.__pirate?.advance(60_000))

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    // First PUT commits on the server (201) but times out after API_TIMEOUT_MS (5000ms), leaving status Pending
    const retryButton = page.getByRole('button', { name: 'Retry' })
    await expect(retryButton).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole('status')).toHaveText('Pending — will retry')

    // Click Retry repeatedly; idempotent PUT returns 200 without duplicating the record
    await retryButton.evaluate((btn: HTMLButtonElement) => {
      btn.click()
      btn.click()
    })
    await expect(page.getByRole('status')).toHaveText('Saved')

    await page.getByRole('button', { name: 'Main Menu' }).click()

    // Check Match History has exactly 1 record
    await page.getByRole('tab', { name: 'Match History' }).click()
    const historyTable = page.getByRole('table', { name: 'Match history' })
    await expect(historyTable).toBeVisible()
    await expect(historyTable.locator('tbody tr')).toHaveCount(1)

    // Check Ranking has exactly 1 entry for CalicoJack
    await page.getByRole('tab', { name: 'Ranking' }).click()
    const rankingTable = page.getByRole('table', { name: 'Ranking' })
    await expect(rankingTable).toBeVisible()
    await expect(rankingTable.locator('tbody tr').filter({ hasText: 'CalicoJack' })).toHaveCount(1)
  })

  test('out-of-order: delayed earlier response does not overwrite newer page or filter data', async ({ page }) => {
    await gotoApp(page, { scenario: 'out-of-order', seed: 404 })

    const rankingTable = page.getByRole('table', { name: 'Ranking' })
    await expect(rankingTable).toBeVisible()
    await expect(page.getByText('Page 1 of 4')).toBeVisible()

    // In out-of-order scenario, even-indexed requests have 900ms latency and odd-indexed requests have 100ms latency.
    // Request #0 was the initial 120s load (900ms).
    // Request #1 (fast: 100ms) -> next page (Page 2), let it settle so the next request is even-indexed (#2: 900ms).
    await page.getByRole('button', { name: 'Next page' }).click()
    await expect(page.getByText('Page 2 of 4')).toBeVisible()
    await expect(page.locator('.datatable')).toHaveAttribute('aria-busy', 'false')

    // Now trigger Request #2 (60s filter -> 900ms slow) and immediately Request #3 (180s filter -> 100ms fast)
    const sessionSelect = page.getByLabel('Session time')
    await sessionSelect.selectOption('60')
    await sessionSelect.selectOption('180')

    // Wait for the faster second request to resolve and then wait longer than the 900ms delayed request
    await expect(page.locator('.datatable')).toHaveAttribute('aria-busy', 'false', { timeout: 5_000 })
    await page.waitForTimeout(1_100)

    // Verify the UI still shows the newer 180s filter data (3 fixture matches: 82, 84, 86) and was not overwritten by 60s data (81, 83, 85)
    await expect(sessionSelect).toHaveValue('180')
    const rows = rankingTable.locator('tbody tr')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('Captain 82')
    await expect(rows.nth(1)).toContainText('Captain 84')
    await expect(rows.nth(2)).toContainText('Captain 86')
  })
})
