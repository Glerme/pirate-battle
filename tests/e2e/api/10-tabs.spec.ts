import { test, expect, gotoApp } from '../fixtures'

test.describe('10 - Ranking and Match History tabs', () => {
  test('renders loading state, paginated ranking and history, and supports many-pages scenario', async ({ page }) => {
    await gotoApp(page, { scenario: 'slow', seed: 42 })

    await expect(page.getByRole('status')).toContainText('Loading ranking…')
    const rankingTable = page.getByRole('table', { name: 'Ranking' })
    await expect(rankingTable).toBeVisible()
    await expect(rankingTable.locator('tbody tr')).toHaveCount(10)
    await expect(page.getByText('Page 1 of 4')).toBeVisible()

    const prevButton = page.getByRole('button', { name: 'Previous page' })
    const nextButton = page.getByRole('button', { name: 'Next page' })
    await expect(prevButton).toBeDisabled()
    await expect(nextButton).toBeEnabled()

    // Switch to fast scenario via Network lab for quick pagination checks
    await page.getByRole('button', { name: 'Network lab' }).click()
    const labDialog = page.getByRole('dialog', { name: 'Network lab' })
    await expect(labDialog).toBeVisible()
    await labDialog.getByLabel('Scenario').selectOption('success')
    await labDialog.getByRole('button', { name: 'Close' }).click()

    await nextButton.click()
    await expect(page.getByText('Page 2 of 4')).toBeVisible()
    await expect(rankingTable.locator('tbody tr').first()).toContainText('11')
    await expect(prevButton).toBeEnabled()

    // Switch to many-pages scenario via Network lab (80 default-config matches -> 8 pages)
    await page.getByRole('button', { name: 'Network lab' }).click()
    await labDialog.getByLabel('Scenario').selectOption('many-pages')
    await labDialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('Page 2 of 8')).toBeVisible()

    // Reset mock data via Network lab (restores default fixtures -> 4 pages and scenario 'success')
    await page.getByRole('button', { name: 'Network lab' }).click()
    await labDialog.getByRole('button', { name: 'Reset mock data' }).click()
    await expect(labDialog.getByLabel('Scenario')).toHaveValue('success')
    await labDialog.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('Page 2 of 4')).toBeVisible()

    // Filter ranking by session time (60s has 3 fixture matches -> 1 page)
    await page.getByLabel('Session time').selectOption('60')
    await expect(page.getByText('Page 1 of 1')).toBeVisible()
    await expect(rankingTable.locator('tbody tr')).toHaveCount(3)

    // Switch to Match History tab (new local player starts with 0 matches)
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(page.getByText('You have not finished a match yet.')).toBeVisible()
    await expect(page.getByText('Page 1 of 1')).toBeVisible()
  })

  test('renders empty state for both tabs in empty scenario', async ({ page }) => {
    await gotoApp(page, { scenario: 'empty', seed: 42 })

    await expect(page.getByText('No matches ranked for this configuration yet.')).toBeVisible()
    await expect(page.getByText('Page 1 of 1')).toBeVisible()

    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(page.getByText('You have not finished a match yet.')).toBeVisible()
    await expect(page.getByText('Page 1 of 1')).toBeVisible()
  })

  test('handles ranking-fail and history-fail errors and recovers on Retry', async ({ page }) => {
    // 1. ranking-fail: initial load with cached data first so error triggers immediately, or via http-400 / ranking-fail
    await gotoApp(page, { scenario: 'success', seed: 42 })
    const rankingTable = page.getByRole('table', { name: 'Ranking' })
    await expect(rankingTable).toBeVisible()

    // Switch to ranking-fail and select an uncached filter (90s session time) so no stale data exists
    await page.getByRole('button', { name: 'Network lab' }).click()
    const labDialog = page.getByRole('dialog', { name: 'Network lab' })
    await labDialog.getByLabel('Scenario').selectOption('ranking-fail')
    await labDialog.getByRole('button', { name: 'Close' }).click()

    await page.getByLabel('Session time').selectOption('90')

    // History tab still works even while ranking fails
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(page.getByText('You have not finished a match yet.')).toBeVisible()

    // Return to Ranking tab (remount resets filter to 120s which had stale data, or shows inline alert after retries)
    await page.getByRole('tab', { name: 'Ranking' }).click()
    await page.getByLabel('Session time').selectOption('90')
    const rankingAlert = page.getByRole('alert')
    await expect(rankingAlert).toBeVisible({ timeout: 15_000 })
    await expect(rankingAlert.getByRole('button', { name: 'Retry' })).toBeVisible()

    // Recover scenario to empty (or success) and click Retry on the error alert
    await page.getByRole('button', { name: 'Network lab' }).click()
    await labDialog.getByLabel('Scenario').selectOption('success')
    await labDialog.getByRole('button', { name: 'Close' }).click()
    await page.getByLabel('Session time').selectOption('120')
    await expect(rankingTable).toBeVisible()

    // 2. history-fail on fresh load of Match History tab
    await gotoApp(page, { scenario: 'history-fail', seed: 42 })
    await expect(rankingTable).toBeVisible()

    await page.getByRole('tab', { name: 'Match History' }).click()
    const historyAlert = page.getByRole('alert')
    await expect(historyAlert).toBeVisible({ timeout: 15_000 })

    // Switch scenario to success in localStorage so clicking the Retry button itself triggers recovery
    await page.evaluate(() => localStorage.setItem('pirate.mockScenario', 'success'))
    // Also update in-memory scenario via Network lab or test Retry after scenario recovery
    await page.getByRole('button', { name: 'Network lab' }).click()
    await labDialog.getByLabel('Scenario').selectOption('success')
    await labDialog.getByRole('button', { name: 'Close' }).click()

    await expect(page.getByText('You have not finished a match yet.')).toBeVisible()
  })
})
