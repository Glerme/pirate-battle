import { DEFAULT_GAME_CONFIG } from '../../../src/game/config'
import { islandRects } from '../../../src/game/sim/map'
import { expect, test } from '../fixtures'
import { advance, startMatch, STEP_MS } from './helpers'

test.describe('03 - Player movement, rotation, arena bounds and island collision', () => {
  test('moves forward and rotates left and right via controls', async ({ page }) => {
    const initial = await startMatch(page, { seed: 42, spawnIntervalSec: 15 })
    const startPlayer = initial.ships[0]!
    expect(startPlayer.x).toBe(960)
    expect(startPlayer.y).toBe(816)
    expect(startPlayer.rotation).toBe(0)

    const touchForward = page.getByRole('button', { name: 'Forward' })
    const useTouch = await touchForward.isVisible()

    if (useTouch) {
      await touchForward.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
    } else {
      await page.keyboard.down('w')
    }
    const afterForward = await advance(page, 500)
    if (useTouch) {
      await touchForward.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true })
    } else {
      await page.keyboard.up('w')
    }

    const movedPlayer = afterForward.ships[0]!
    expect(movedPlayer.y).toBeLessThan(startPlayer.y - 20)
    expect(movedPlayer.x).toBeCloseTo(startPlayer.x, 4)

    // Turn right
    const touchRight = page.getByRole('button', { name: 'Turn right' })
    if (useTouch) {
      await touchRight.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
    } else {
      await page.keyboard.down('d')
    }
    const afterRight = await advance(page, 250)
    if (useTouch) {
      await touchRight.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true })
    } else {
      await page.keyboard.up('d')
    }
    expect(afterRight.ships[0]!.rotation).toBeGreaterThan(0.4)

    // Turn left
    const touchLeft = page.getByRole('button', { name: 'Turn left' })
    if (useTouch) {
      await touchLeft.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true })
    } else {
      await page.keyboard.down('a')
    }
    const afterLeft = await advance(page, 500)
    if (useTouch) {
      await touchLeft.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true })
    } else {
      await page.keyboard.up('a')
    }
    expect(afterLeft.ships[0]!.rotation).toBeLessThan(0)
  })

  test('clamps player ship inside visible arena boundaries', async ({ page }) => {
    await startMatch(page, { seed: 42, spawnIntervalSec: 15 })
    const radius = DEFAULT_GAME_CONFIG.ships.player.radius

    // Player starts at (960, 816) facing straight up (rotation = 0), clear of islands at x=960
    await page.keyboard.down('ArrowUp')
    const atTopWall = await advance(page, 6000)
    await page.keyboard.up('ArrowUp')

    const player = atTopWall.ships[0]!
    expect(player.y).toBeCloseTo(radius, 3)

    // Pushing further north stays clamped at radius
    await page.keyboard.down('ArrowUp')
    const pushedFurther = await advance(page, 500)
    await page.keyboard.up('ArrowUp')
    expect(pushedFurther.ships[0]!.y).toBeCloseTo(radius, 3)
  })

  test('blocks player ship from passing through an island', async ({ page }) => {
    await startMatch(page, { seed: 42, spawnIntervalSec: 15 })
    const radius = DEFAULT_GAME_CONFIG.ships.player.radius
    const leftIsland = islandRects[0]! // left: 320, right: 576, top: 384, bottom: 640

    // Follow deterministic trajectory into the right edge (x = 576) of the left island:
    // Move up from y=816 to y~507, turn left by ~90 deg, then drive straight west into the island.
    await page.keyboard.down('w')
    await advance(page, 1600)
    await page.keyboard.up('w')

    await page.keyboard.down('a')
    await advance(page, 650)
    await page.keyboard.up('a')

    await page.keyboard.down('w')
    const checkResult = await page.evaluate(
      ({ stepMs, island }) => {
        const pirate = window.__pirate!
        pirate.advance(stepMs)
        let minDistance = Infinity
        for (let elapsed = 0; elapsed < 3500; elapsed += 100) {
          pirate.advance(100)
          const st = pirate.getState()!
          const p = st.ships[0]!
          const dx = p.x - Math.min(island.right, Math.max(island.left, p.x))
          const dy = p.y - Math.min(island.bottom, Math.max(island.top, p.y))
          minDistance = Math.min(minDistance, Math.hypot(dx, dy))
        }
        return { minDistance, finalPlayer: pirate.getState()!.ships[0]! }
      },
      { stepMs: STEP_MS, island: leftIsland },
    )
    await page.keyboard.up('w')

    expect(checkResult.minDistance).toBeGreaterThanOrEqual(radius - 1e-5)
    const finalPlayer = checkResult.finalPlayer
    expect(finalPlayer.x).toBeGreaterThanOrEqual(leftIsland.right + radius - 1e-4)
    expect(finalPlayer.y).toBeGreaterThan(leftIsland.top)
    expect(finalPlayer.y).toBeLessThan(leftIsland.bottom)
  })
})
