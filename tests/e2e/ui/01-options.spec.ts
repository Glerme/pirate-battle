import { expect, gotoApp, test } from '../fixtures'

test.describe('01-options: keyboard navigation, accessible validation, save, persistence, and match config snapshot', () => {
  test('keyboard navigation from menu to options, accessible validation errors, save, and persistence after refresh', async ({ page }) => {
    await gotoApp(page, { scenario: 'success', seed: 101 })

    // Navigate to Options via keyboard
    const optionsBtn = page.getByRole('button', { name: 'Options' })
    await optionsBtn.focus()
    await expect(optionsBtn).toBeFocused()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/options/)
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible()

    const sessionInput = page.getByLabel('Game session time')
    const spawnInput = page.getByLabel('Enemy spawn time')
    const captainInput = page.getByLabel('Captain name')
    const saveBtn = page.getByRole('button', { name: 'Save' })

    // Defaults
    await expect(sessionInput).toHaveValue('120')
    await expect(spawnInput).toHaveValue('4')
    await expect(captainInput).toHaveValue('Captain')
    await expect(saveBtn).toBeEnabled()

    // Keyboard tab navigation across controls
    await sessionInput.focus()
    await expect(sessionInput).toBeFocused()
    await page.keyboard.press('Tab') // Increase session seconds
    await expect(page.getByRole('button', { name: 'Increase session seconds' })).toBeFocused()
    await page.keyboard.press('Tab') // Decrease spawn seconds
    await expect(page.getByRole('button', { name: 'Decrease spawn seconds' })).toBeFocused()
    await page.keyboard.press('Tab') // Enemy spawn time input
    await expect(spawnInput).toBeFocused()

    // Validation: invalid session time (< 60)
    await sessionInput.fill('30')
    await expect(sessionInput).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('alert')).toContainText('Enter a whole number from 60 to 180 seconds.')
    await expect(saveBtn).toBeDisabled()

    // Validation: invalid spawn time (0 / out of 1..15) and invalid captain name (< 2 chars)
    await spawnInput.fill('0')
    await captainInput.fill('A')
    await expect(spawnInput).toHaveAttribute('aria-invalid', 'true')
    await expect(captainInput).toHaveAttribute('aria-invalid', 'true')
    const alerts = page.getByRole('alert')
    await expect(alerts).toHaveCount(3)
    await expect(alerts.nth(1)).toContainText('Enter a whole number from 1 to 15 seconds.')
    await expect(alerts.nth(2)).toContainText('Use 2 to 16 characters.')
    await expect(saveBtn).toBeDisabled()

    // Fix inputs using direct fill and stepper buttons
    await sessionInput.fill('89')
    await page.getByRole('button', { name: 'Increase session seconds' }).click()
    await expect(sessionInput).toHaveValue('90')
    await expect(sessionInput).toHaveAttribute('aria-invalid', 'false')

    await spawnInput.fill('6')
    await page.getByRole('button', { name: 'Decrease spawn seconds' }).click()
    await expect(spawnInput).toHaveValue('5')
    await expect(spawnInput).toHaveAttribute('aria-invalid', 'false')

    await captainInput.fill('Blackbeard')
    await expect(captainInput).toHaveAttribute('aria-invalid', 'false')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(saveBtn).toBeEnabled()

    // Save options
    await saveBtn.click()
    await expect(page.getByRole('status')).toHaveText('Options saved.')

    // Persistence after page reload
    await page.reload()
    await expect(page.getByLabel('Game session time')).toHaveValue('90')
    await expect(page.getByLabel('Enemy spawn time')).toHaveValue('5')
    await expect(page.getByLabel('Captain name')).toHaveValue('Blackbeard')
  })

  test('each match uses a frozen config snapshot at start and later option changes only apply to the next match', async ({ page }) => {
    test.setTimeout(90_000)
    await gotoApp(page, { scenario: 'success', seed: 202 })

    // Configure 75s session, 3s spawn
    await page.getByRole('button', { name: 'Options' }).click()
    await page.getByLabel('Game session time').fill('75')
    await page.getByLabel('Enemy spawn time').fill('3')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByRole('status')).toHaveText('Options saved.')

    await page.getByRole('button', { name: 'Main Menu' }).click()
    await page.getByRole('button', { name: 'Play' }).click()

    // Wait for combat session to start (allow time for Pixi assets and WebGL init under parallel load)
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.status), { timeout: 15_000 }).toBe('running')
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.remainingSec)).toBe(75)

    // Mutate saved options in localStorage while match 1 is running (simulating external/later config change)
    await page.evaluate(() => {
      localStorage.setItem(
        'pirate.options.v1',
        JSON.stringify({ v: 1, data: { sessionTimeSec: 150, spawnIntervalSec: 10, captainName: 'Captain' } }),
      )
    })

    // Advance 3s: match 1 must still use spawnIntervalSec=3 (first enemy spawns at 3000ms) and duration=75s (72s left)
    await page.evaluate(() => window.__pirate?.advance(3000))
    const midState = await page.evaluate(() => window.__pirate?.getState())
    expect(midState?.remainingSec).toBe(72)
    expect(midState?.ships.filter((s) => s.kind !== 'player').length).toBe(1)

    // Finish match 1 and verify its recorded config snapshot is still {75, 3}
    await page.evaluate(() => window.__pirate?.advance(72000))
    await expect(page).toHaveURL(/\/result/)
    const lastResult1 = await page.evaluate(() => {
      const raw = localStorage.getItem('pirate.lastResult.v1')
      return raw ? JSON.parse(raw).data : null
    })
    expect(lastResult1?.config).toEqual({ sessionTimeSec: 75, spawnIntervalSec: 3 })

    // Start the next match via Play Again: now it must pick up the new options {150, 10}
    await page.getByRole('button', { name: 'Play Again' }).click()
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.status), { timeout: 15_000 }).toBe('running')
    const nextState = await page.evaluate(() => window.__pirate?.getState())
    expect(nextState?.remainingSec).toBe(150)

    // At 3s in match 2, no enemy has spawned yet because spawnIntervalSec is now 10s
    await page.evaluate(() => window.__pirate?.advance(3000))
    const nextAfter3s = await page.evaluate(() => window.__pirate?.getState())
    expect(nextAfter3s?.ships.filter((s) => s.kind !== 'player').length).toBe(0)
  })
})
