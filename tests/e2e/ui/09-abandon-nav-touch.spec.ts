import { expect, gotoApp, test } from '../fixtures'

test.describe('09-abandon-nav-touch: abandon match without registering, repeated navigation without canvas leak, and mobile touch controls', () => {
  test('leaving combat via pause menu or page refresh abandons the match without saving result or registering', async ({ page }) => {
    await gotoApp(page, { scenario: 'success', seed: 303 })

    // Start match 1 and advance 5 seconds
    await page.getByRole('button', { name: 'Play' }).click()
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.status), { timeout: 15_000 }).toBe('running')
    await page.evaluate(() => window.__pirate?.advance(5000))

    // Pause and exit to Main Menu
    await page.getByRole('button', { name: 'Pause' }).click()
    await expect(page.getByRole('heading', { name: 'Paused' })).toBeVisible()
    await page.getByRole('button', { name: 'Main Menu' }).click()

    await expect(page).toHaveURL(/\/(\?.*)?$/)

    // Verify nothing was saved in localStorage for lastResult, pendingMatches, or confirmed mockMatches
    const storageAfterPauseExit = await page.evaluate(() => ({
      lastResult: localStorage.getItem('pirate.lastResult.v1'),
      pendingMatches: localStorage.getItem('pendingMatches'),
      mockMatches: localStorage.getItem('pirate.mockMatches'),
    }))
    expect(storageAfterPauseExit.lastResult).toBeNull()
    expect(storageAfterPauseExit.pendingMatches).toBeNull()
    expect(storageAfterPauseExit.mockMatches).toBeNull()

    // Also verify Match History tab shows empty state
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(page.getByText('You have not finished a match yet.')).toBeVisible()

    // Start match 2, advance 5 seconds, then reload page mid-combat
    await page.getByRole('button', { name: 'Play' }).click()
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.status), { timeout: 15_000 }).toBe('running')
    await page.evaluate(() => window.__pirate?.advance(5000))

    await page.reload()
    // Reload on /play redirects back to Main Menu
    await expect(page).toHaveURL(/\/(\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()

    const storageAfterReload = await page.evaluate(() => ({
      lastResult: localStorage.getItem('pirate.lastResult.v1'),
      pendingMatches: localStorage.getItem('pendingMatches'),
      mockMatches: localStorage.getItem('pirate.mockMatches'),
    }))
    expect(storageAfterReload.lastResult).toBeNull()
    expect(storageAfterReload.pendingMatches).toBeNull()
    expect(storageAfterReload.mockMatches).toBeNull()
  })

  test('repeated navigation across screens leaves no leaked canvas elements or Pixi applications', async ({ page }) => {
    test.setTimeout(90_000)
    await gotoApp(page, { scenario: 'success', seed: 404 })

    for (let cycle = 0; cycle < 4; cycle++) {
      await page.getByRole('button', { name: 'Options' }).click()
      await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible()
      await expect(page.locator('canvas')).toHaveCount(0)

      await page.getByRole('button', { name: 'Main Menu' }).click()
      await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
      await expect(page.locator('canvas')).toHaveCount(0)

      await page.getByRole('button', { name: 'Play' }).click()
      await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.status), { timeout: 15_000 }).toBe('running')
      await expect(page.locator('canvas')).toHaveCount(1)

      await page.evaluate(() => window.__pirate?.advance(500))

      // Exit via Pause -> Main Menu
      await page.getByRole('button', { name: 'Pause' }).click()
      await page.getByRole('button', { name: 'Main Menu' }).click()
      await expect(page.getByRole('button', { name: 'Play' })).toBeVisible()
      await expect(page.locator('canvas')).toHaveCount(0)

      const leaked = await page.evaluate(() => ({
        canvases: document.querySelectorAll('canvas').length,
        pixiApp: Boolean((globalThis as { __PIXI_APP__?: unknown }).__PIXI_APP__),
        testSession: window.__pirate?.getState() ?? null,
      }))
      expect(leaked.canvases).toBe(0)
      expect(leaked.pixiApp).toBe(false)
      expect(leaked.testSession).toBeNull()
    }
  })

  test('touch controls move and fire simultaneously on mobile project and keyboard controls work on desktop', async ({ page }, testInfo) => {
    await gotoApp(page, { scenario: 'success', seed: 505 })
    await page.getByRole('button', { name: 'Play' }).click()
    await expect.poll(() => page.evaluate(() => window.__pirate?.getState()?.status), { timeout: 15_000 }).toBe('running')

    const initial = await page.evaluate(() => {
      const s = window.__pirate!.getState()!
      const player = s.ships.find((sh) => sh.kind === 'player')!
      return { x: player.x, y: player.y, rotation: player.rotation, projectiles: s.projectiles.length }
    })

    if (testInfo.project.name === 'chromium-mobile') {
      const forwardBtn = page.getByRole('button', { name: 'Forward' })
      const turnRightBtn = page.getByRole('button', { name: 'Turn right' })
      const fireFrontBtn = page.getByRole('button', { name: 'Fire front' })
      const fireLeftBtn = page.getByRole('button', { name: 'Fire left' })

      await expect(forwardBtn).toBeVisible()
      await expect(turnRightBtn).toBeVisible()
      await expect(fireFrontBtn).toBeVisible()
      await expect(fireLeftBtn).toBeVisible()

      // Tap works on touch buttons (verifying Playwright mobile tap gesture reception)
      await forwardBtn.tap()

      // Hold multiple touch buttons simultaneously via pointerdown with distinct pointerIds (multitouch).
      // Ensure setPointerCapture is safe for synthetic PointerEvents in Chromium.
      await page.evaluate(() => {
        const orig = Element.prototype.setPointerCapture
        Element.prototype.setPointerCapture = function (id: number) {
          try {
            orig.call(this, id)
          } catch {
            // Synthetic pointerIds in automated multitouch tests may not be active hardware pointers
          }
        }
      })

      for (const [locator, pointerId] of [
        [forwardBtn, 1],
        [turnRightBtn, 2],
        [fireFrontBtn, 3],
        [fireLeftBtn, 4],
      ] as const) {
        await locator.dispatchEvent('pointerdown', {
          pointerId,
          pointerType: 'touch',
          isPrimary: pointerId === 1,
          buttons: 1,
        })
      }

      // Advance 250ms while all 4 touch controls are held
      await page.evaluate(() => window.__pirate?.advance(250))

      const active = await page.evaluate(() => {
        const s = window.__pirate!.getState()!
        const player = s.ships.find((sh) => sh.kind === 'player')!
        return {
          x: player.x,
          y: player.y,
          rotation: player.rotation,
          playerProjectiles: s.projectiles.filter((p) => p.faction === 'player').length,
        }
      })

      // Player moved forward, rotated right, and fired both front (1) + left broadside (3) = 4 projectiles
      expect(Math.hypot(active.x - initial.x, active.y - initial.y)).toBeGreaterThan(5)
      expect(active.rotation).toBeGreaterThan(initial.rotation)
      expect(active.playerProjectiles).toBe(4)

      // Release touch pointers
      for (const [locator, pointerId] of [
        [forwardBtn, 1],
        [turnRightBtn, 2],
        [fireFrontBtn, 3],
        [fireLeftBtn, 4],
      ] as const) {
        await locator.dispatchEvent('pointerup', {
          pointerId,
          pointerType: 'touch',
          isPrimary: pointerId === 1,
          buttons: 0,
        })
      }

      // After releasing forward, advancing another step stops movement
      const afterReleasePos = await page.evaluate(() => {
        window.__pirate?.advance(100)
        const p1 = window.__pirate!.getState()!.ships.find((sh) => sh.kind === 'player')!
        const snap1 = { x: p1.x, y: p1.y, rotation: p1.rotation }
        window.__pirate?.advance(100)
        const p2 = window.__pirate!.getState()!.ships.find((sh) => sh.kind === 'player')!
        return { snap1, snap2: { x: p2.x, y: p2.y, rotation: p2.rotation } }
      })
      expect(afterReleasePos.snap2).toEqual(afterReleasePos.snap1)
    } else {
      // Desktop: touch pads are hidden, real keyboard controls move and fire simultaneously
      await expect(page.getByRole('button', { name: 'Forward' })).toHaveCount(0)

      await page.keyboard.down('KeyW')
      await page.keyboard.down('KeyD')
      await page.keyboard.down('Space')
      await page.keyboard.down('KeyQ')

      await page.evaluate(() => window.__pirate?.advance(250))

      await page.keyboard.up('KeyW')
      await page.keyboard.up('KeyD')
      await page.keyboard.up('Space')
      await page.keyboard.up('KeyQ')

      const active = await page.evaluate(() => {
        const s = window.__pirate!.getState()!
        const player = s.ships.find((sh) => sh.kind === 'player')!
        return {
          x: player.x,
          y: player.y,
          rotation: player.rotation,
          playerProjectiles: s.projectiles.filter((p) => p.faction === 'player').length,
        }
      })

      expect(Math.hypot(active.x - initial.x, active.y - initial.y)).toBeGreaterThan(5)
      expect(active.rotation).toBeGreaterThan(initial.rotation)
      expect(active.playerProjectiles).toBe(4)
    }
  })
})
