import { test, expect, gotoApp } from '../fixtures'

test.describe('11 - Match registration and outbox recovery', () => {
  test.setTimeout(60_000)

  test('finishes a short match with manual clock and updates both Ranking and Match History tabs', async ({ page }) => {
    await gotoApp(page, { scenario: 'empty', seed: 101 })

    // Configure shortest session time (60s) and distinct captain name via Options UI
    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByLabel('Game session time').fill('60')
    await page.getByLabel('Captain name').fill('Blackbeard')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toContainText('Options saved.')
    await page.getByRole('button', { name: 'Main Menu' }).click()

    // Start match and wait for simulation ready
    await page.getByRole('button', { name: 'Play' }).click()
    await page.waitForFunction(() => window.__pirate?.getState()?.status === 'running')

    // Trigger real control input (fire front cannon / touch button) and verificare effect via getState(), then advance simulation clock to end of match
    const touchFire = page.getByRole('button', { name: 'Fire front' })
    if (await touchFire.isVisible()) {
      await touchFire.dispatchEvent('pointerdown', { pointerId: 1 })
      await page.evaluate(() => window.__pirate?.advance(50))
      await touchFire.dispatchEvent('pointerup', { pointerId: 1 })
    } else {
      await page.keyboard.down('Space')
      await page.evaluate(() => window.__pirate?.advance(50))
      await page.keyboard.up('Space')
    }
    const projectilesAfterFire = await page.evaluate(() => window.__pirate?.getState()?.projectiles.length ?? 0)
    expect(projectilesAfterFire).toBeGreaterThan(0)
    await page.evaluate(() => window.__pirate?.advance(60_000))

    // Result screen appears and saves registration
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Saved')

    // Return to Main Menu and verify entry appears in Ranking and Match History
    await page.getByRole('button', { name: 'Main Menu' }).click()
    const rankingTable = page.getByRole('table', { name: 'Ranking' })
    await expect(rankingTable).toBeVisible()
    await expect(rankingTable.locator('tbody tr')).toHaveCount(1)
    await expect(rankingTable.locator('tbody tr').first()).toContainText('Blackbeard')
    await expect(rankingTable.locator('tbody tr').first()).toContainText('YOU')

    await page.getByRole('tab', { name: 'Match History' }).click()
    const historyTable = page.getByRole('table', { name: 'Match history' })
    await expect(historyTable).toBeVisible()
    await expect(historyTable.locator('tbody tr')).toHaveCount(1)
    await expect(historyTable.locator('tbody tr').first()).toContainText('Ship destroyed')
  })

  test('unavailable-then-recover leaves match pending, and page refresh recovers and sends without duplication', async ({ page }) => {
    await gotoApp(page, { scenario: 'unavailable-then-recover', seed: 202 })

    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByLabel('Game session time').fill('60')
    await page.getByLabel('Captain name').fill('AnneBonny')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByRole('button', { name: 'Main Menu' }).click()

    await page.getByRole('button', { name: 'Play' }).click()
    await page.waitForFunction(() => window.__pirate?.getState()?.status === 'running')
    await page.keyboard.press('Space')
    await page.evaluate(() => window.__pirate?.advance(60_000))

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Pending — will retry')
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()

    const pendingCountBefore = await page.evaluate(() => {
      const raw = localStorage.getItem('pendingMatches')
      return raw ? (JSON.parse(raw) as unknown[]).length : 0
    })
    expect(pendingCountBefore).toBe(1)

    // Reload page: outbox flushes on boot and the second attempt succeeds in unavailable-then-recover
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('Saved')

    const pendingCountAfter = await page.evaluate(() => {
      const raw = localStorage.getItem('pendingMatches')
      return raw ? (JSON.parse(raw) as unknown[]).length : 0
    })
    expect(pendingCountAfter).toBe(0)

    // Verify single record in Match History and Ranking (no duplicate entries)
    await page.getByRole('button', { name: 'Main Menu' }).click()
    await page.getByRole('tab', { name: 'Match History' }).click()
    const historyTable = page.getByRole('table', { name: 'Match history' })
    await expect(historyTable).toBeVisible()
    await expect(historyTable.locator('tbody tr')).toHaveCount(1)

    await page.getByRole('tab', { name: 'Ranking' }).click()
    const rankingTable = page.getByRole('table', { name: 'Ranking' })
    await expect(rankingTable).toBeVisible()
    await expect(rankingTable.locator('tbody tr').filter({ hasText: 'AnneBonny' })).toHaveCount(1)
  })
})
