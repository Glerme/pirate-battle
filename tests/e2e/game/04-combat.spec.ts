import { DEFAULT_GAME_CONFIG } from '../../../src/game/config'
import { expect, test } from '../fixtures'
import { advance, startMatch, STEP_MS } from './helpers'

test.describe('04 - Combat: front & broadside shots, cooldowns, damage and scoring without duplication', () => {
  test('fires 1 front projectile and 3 parallel broadside projectiles left/right while respecting weapon cooldowns', async ({ page }) => {
    await startMatch(page, { seed: 42, spawnIntervalSec: 15 })

    const touchFront = page.getByRole('button', { name: 'Fire front' })
    const useTouch = await touchFront.isVisible()

    // Trigger front (1) + left broadside (3) on the first tick
    if (useTouch) {
      await page.evaluate(() => {
        const fireFront = document.querySelector<HTMLElement>('button[aria-label="Fire front"]')!
        const fireLeft = document.querySelector<HTMLElement>('button[aria-label="Fire left"]')!
        fireFront.setPointerCapture = () => {}
        fireLeft.setPointerCapture = () => {}
        fireFront.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))
        fireLeft.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2 }))
      })
    } else {
      await page.keyboard.down(' ')
      await page.keyboard.down('q')
    }

    const firstTick = await advance(page, STEP_MS)
    expect(firstTick.projectiles).toHaveLength(4)

    // Next tick: front and left are on cooldown, adding right broadside spawns 3 more (total 7)
    if (useTouch) {
      await page.evaluate(() => {
        const fireRight = document.querySelector<HTMLElement>('button[aria-label="Fire right"]')!
        fireRight.setPointerCapture = () => {}
        fireRight.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3 }))
      })
    } else {
      await page.keyboard.down('e')
    }

    const secondTick = await advance(page, STEP_MS)
    expect(secondTick.projectiles).toHaveLength(7)

    // Verify parallel broadside geometry: 3 right-side projectiles share rotation (pi/2) and x, spaced by 22px along y
    const rightShots = secondTick.projectiles.slice(4)
    expect(rightShots).toHaveLength(3)
    for (const p of rightShots) {
      expect(p.faction).toBe('player')
      expect(p.rotation).toBeCloseTo(Math.PI / 2, 4)
      expect(p.x).toBeCloseTo(rightShots[0]!.x, 4)
    }
    const ys = rightShots.map((p) => p.y).sort((a, b) => a - b)
    expect(ys[1]! - ys[0]!).toBeCloseTo(DEFAULT_GAME_CONFIG.weapons.broadside.spacing, 3)
    expect(ys[2]! - ys[1]!).toBeCloseTo(DEFAULT_GAME_CONFIG.weapons.broadside.spacing, 3)

    // Advancing 100ms while holding all fire inputs must not fire again (front cooldown is 350ms, broadside is 900ms)
    const duringCooldown = await advance(page, 100)
    expect(duringCooldown.projectiles).toHaveLength(7)

    // After front cooldown (total elapsed >= 350ms) front fires 1 new projectile, while broadsides (900ms) remain on cooldown
    const afterFrontCooldown = await advance(page, 250)
    expect(afterFrontCooldown.projectiles).toHaveLength(8)

    if (useTouch) {
      await page.evaluate(() => {
        for (const [id, label] of [[1, 'Fire front'], [2, 'Fire left'], [3, 'Fire right']] as const) {
          document.querySelector<HTMLElement>(`button[aria-label="${label}"]`)!
            .dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: id }))
        }
      })
    } else {
      await page.keyboard.up(' ')
      await page.keyboard.up('q')
      await page.keyboard.up('e')
    }
  })

  test('damages enemy ship on projectile hit and awards exactly +1 score per kill without duplication', async ({ page }) => {
    // With seed=2 and spawnIntervalSec=1, the first spawn at 1000ms is a chaser at (960, 160),
    // directly ahead of the player at (960, 816) facing north (rotation = 0).
    await startMatch(page, { seed: 2, spawnIntervalSec: 1 })

    const afterSpawn = await advance(page, 1000)
    const chaser = afterSpawn.ships.find((s) => s.kind === 'chaser')!
    expect(chaser).toBeDefined()
    expect(chaser.x).toBe(960)
    expect(chaser.hp).toBe(2)

    // Move closer so our shots hit the chaser quickly
    await page.keyboard.down('w')
    await advance(page, 1000)
    await page.keyboard.up('w')

    // First front shot hits and reduces chaser HP from 2 to 1 (single-hit guarantee, projectile removed)
    await page.keyboard.down(' ')
    await advance(page, STEP_MS)
    await page.keyboard.up(' ')

    let state = await advance(page, 600)
    const damagedChaser = state.ships.find((s) => s.id === chaser.id)!
    expect(damagedChaser).toBeDefined()
    expect(damagedChaser.hp).toBe(1)
    expect(state.score).toBe(0)
    expect(state.projectiles.filter((p) => p.faction === 'player')).toHaveLength(0)

    // Wait for front cooldown, fire second shot (and a follow-up shot right after cooldown) to destroy the chaser
    await advance(page, 200)
    await page.keyboard.down(' ')
    state = await advance(page, 1000)
    await page.keyboard.up(' ')

    expect(state.ships.find((s) => s.id === chaser.id)).toBeUndefined()
    expect(state.score).toBe(1)
    await expect(page.getByRole('group', { name: 'Score' })).toHaveText('1')
  })
})
