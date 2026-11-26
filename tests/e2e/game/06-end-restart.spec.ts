import { DEFAULT_GAME_CONFIG } from '../../../src/game/config'
import { expect, test } from '../fixtures'
import { advance, getState, startMatch } from './helpers'

test.describe('06 - Match end (time up & destroyed), frozen simulation, and clean restart via Play Again', () => {
  test('ends match when time runs out, freezes simulation, and restarts cleanly via Play Again', async ({ page }) => {
    await startMatch(page, { seed: 42, sessionTimeSec: 60, spawnIntervalSec: 15 })

    // Run a lightweight survival loop in 250ms chunks with spawnIntervalSec=15:
    // Move forward, fire front & broadsides, turn slightly to circle the open arena and score >= 1 kill before 60_000ms.
    const preEnd = await page.evaluate(() => {
      const pirate = window.__pirate!
      const key = (type: 'keydown' | 'keyup', k: string, code: string) => {
        window.dispatchEvent(new KeyboardEvent(type, { key: k, code, cancelable: true }))
      }
      key('keydown', 'w', 'KeyW')
      key('keydown', ' ', 'Space')
      key('keydown', 'q', 'KeyQ')
      key('keydown', 'e', 'KeyE')

      // 239 * 250ms = 59_750ms
      for (let i = 0; i < 239; i++) {
        if (i % 10 === 8) key('keydown', 'd', 'KeyD')
        if (i % 10 === 0) key('keyup', 'd', 'KeyD')
        pirate.advance(250)
      }
      const beforeFinalChunk = pirate.getState()!
      // Final 250ms reaches 60_000ms and triggers time_up
      pirate.advance(250)
      key('keyup', 'w', 'KeyW')
      key('keyup', ' ', 'Space')
      key('keyup', 'q', 'KeyQ')
      key('keyup', 'e', 'KeyE')
      key('keyup', 'd', 'KeyD')
      return beforeFinalChunk
    })

    expect(preEnd.hp).toBeGreaterThan(0)

    // Result screen should be displayed with Time up
    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.getByText('Time up')).toBeVisible()

    // Click Play Again and verify fresh match state
    await page.getByRole('button', { name: 'Play Again' }).click()
    await expect
      .poll(async () => page.evaluate(() => window.__pirate?.getState()?.status ?? null), { timeout: 15_000 })
      .toBe('running')

    const restarted = await getState(page)
    expect(restarted.status).toBe('running')
    expect(restarted.score).toBe(0)
    expect(restarted.hp).toBe(DEFAULT_GAME_CONFIG.ships.player.maxHp)
    expect(restarted.remainingSec).toBe(60)
    expect(restarted.simTimeMs).toBe(0)
    expect(restarted.ships).toHaveLength(1)
    expect(restarted.projectiles).toHaveLength(0)
    expect(restarted.ships[0]?.x).toBe(960)
    expect(restarted.ships[0]?.y).toBe(816)
  })

  test('ends match when player hull reaches zero and freezes simulation after end', async ({ page }) => {
    await startMatch(page, { seed: 42, sessionTimeSec: 120, spawnIntervalSec: 4 })

    // Advance in a single evaluate until player HP hits 0 (takes ~39.3s with seed 42)
    await page.evaluate(() => {
      const pirate = window.__pirate!
      for (let i = 0; i < 50; i++) {
        pirate.advance(1000)
        const st = pirate.getState()
        if (!st || st.status === 'ended') break
      }
    })

    await expect(page.getByRole('heading', { name: 'Battle complete' })).toBeVisible()
    await expect(page.getByText('Ship destroyed')).toBeVisible()

    // Also verify in-place simulation freeze when staying on the session before teardown:
    await page.getByRole('button', { name: 'Play Again' }).click()
    await expect
      .poll(async () => page.evaluate(() => window.__pirate?.getState()?.status ?? null), { timeout: 15_000 })
      .toBe('running')

    const frozenCheck = await page.evaluate(() => {
      const pirate = window.__pirate!
      pirate.setSeed(42)
      // Advance to destruction inside a single synchronous evaluate (before React navigates away)
      pirate.advance(45_000)
      const atEnd = pirate.getState()!
      // Try advancing further and pressing keys after match ended
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', cancelable: true }))
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', cancelable: true }))
      pirate.advance(10_000)
      const afterExtraAdvance = pirate.getState()!
      return { atEnd, afterExtraAdvance }
    })

    expect(frozenCheck.atEnd.status).toBe('ended')
    expect(frozenCheck.atEnd.hp).toBe(0)
    expect(frozenCheck.afterExtraAdvance.simTimeMs).toBe(frozenCheck.atEnd.simTimeMs)
    expect(frozenCheck.afterExtraAdvance.score).toBe(frozenCheck.atEnd.score)
    expect(frozenCheck.afterExtraAdvance.ships).toEqual(frozenCheck.atEnd.ships)
    expect(frozenCheck.afterExtraAdvance.projectiles).toEqual(frozenCheck.atEnd.projectiles)
  })
})
