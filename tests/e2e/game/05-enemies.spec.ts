import { DEFAULT_GAME_CONFIG } from '../../../src/game/config'
import { nearIsland } from '../../../src/game/sim/geometry'
import { expect, test } from '../fixtures'
import { advance, startMatch, STEP_MS } from './helpers'

test.describe('05 - Enemies: Chaser ramming, Shooter range & firing, spawn interval and safe distance', () => {
  test('spawns enemies at the configured interval, away from player and clear of islands, with Chaser then Shooter', async ({ page }) => {
    const intervalSec = 2
    const initial = await startMatch(page, { seed: 42, spawnIntervalSec: intervalSec })
    expect(initial.ships).toHaveLength(1)

    // Right before 2000ms: no enemy spawned yet
    const beforeFirst = await advance(page, 1950)
    expect(beforeFirst.ships).toHaveLength(1)

    // Cross 2000ms: first enemy spawns (guaranteed chaser)
    const atFirst = await advance(page, 100)
    expect(atFirst.ships).toHaveLength(2)
    const player1 = atFirst.ships[0]!
    const firstEnemy = atFirst.ships[1]!
    expect(firstEnemy.kind).toBe('chaser')

    const dist1 = Math.hypot(firstEnemy.x - player1.x, firstEnemy.y - player1.y)
    expect(dist1).toBeGreaterThanOrEqual(DEFAULT_GAME_CONFIG.spawn.minDistanceFromPlayer)
    expect(nearIsland(firstEnemy, DEFAULT_GAME_CONFIG.spawn.clearRadius)).toBe(false)

    // Cross 4000ms: second enemy spawns (guaranteed shooter)
    const atSecond = await advance(page, 2000)
    expect(atSecond.ships).toHaveLength(3)
    const secondEnemy = atSecond.ships[2]!
    expect(secondEnemy.kind).toBe('shooter')

    const dist2 = Math.hypot(secondEnemy.x - atSecond.ships[0]!.x, secondEnemy.y - atSecond.ships[0]!.y)
    expect(dist2).toBeGreaterThanOrEqual(DEFAULT_GAME_CONFIG.spawn.minDistanceFromPlayer)
    expect(nearIsland(secondEnemy, DEFAULT_GAME_CONFIG.spawn.clearRadius)).toBe(false)
  })

  test('Chaser pursues the player, deals ram damage on impact, and explodes without awarding score', async ({ page }) => {
    const initial = await startMatch(page, { seed: 42, spawnIntervalSec: 4 })
    const startHp = initial.hp

    const atSpawn = await advance(page, 4050)
    const player = atSpawn.ships[0]!
    const chaser = atSpawn.ships.find((s) => s.kind === 'chaser')!
    expect(chaser).toBeDefined()
    const initialDistance = Math.hypot(chaser.x - player.x, chaser.y - player.y)

    // Advance 1s: chaser closes distance toward the player
    const midChase = await advance(page, 1000)
    const chaserMid = midChase.ships.find((s) => s.id === chaser.id)!
    const midDistance = Math.hypot(chaserMid.x - midChase.ships[0]!.x, chaserMid.y - midChase.ships[0]!.y)
    expect(midDistance).toBeLessThan(initialDistance - 100)

    // Step until the chaser rams the player
    const state = await page.evaluate((chaserId) => {
      const pirate = window.__pirate!
      let st = pirate.getState()!
      for (let i = 0; i < 60 && st.ships.some((s) => s.id === chaserId); i++) {
        pirate.advance(100)
        st = pirate.getState()!
      }
      return st
    }, chaser.id)

    expect(state.ships.find((s) => s.id === chaser.id)).toBeUndefined()
    expect(state.hp).toBe(startHp - DEFAULT_GAME_CONFIG.chaser.ramDamage)
    expect(state.score).toBe(0)
  })

  test('Shooter approaches and fires only when within attackRange', async ({ page }) => {
    await startMatch(page, { seed: 42, spawnIntervalSec: 1 })
    const attackRange = DEFAULT_GAME_CONFIG.shooter.attackRange

    // First spawn at 1s (chaser), second spawn at 2s (shooter)
    await advance(page, 2000)

    const result = await page.evaluate(
      ({ maxSteps, stepMs, range }) => {
        const pirate = window.__pirate!
        const initial = pirate.getState()!
        const shooter = initial.ships.find((s) => s.kind === 'shooter')
        if (!shooter) return { found: false, firedOutsideRange: false, shooterFired: false, fireDist: -1 }

        let firedOutsideRange = false
        let shooterFired = false
        let fireDist = -1

        for (let i = 0; i < maxSteps; i++) {
          pirate.advance(stepMs)
          const st = pirate.getState()
          if (!st || st.status !== 'running') break
          const curShooter = st.ships.find((s) => s.id === shooter.id)
          const player = st.ships[0]
          if (!curShooter || !player) break

          const dist = Math.hypot(curShooter.x - player.x, curShooter.y - player.y)
          const enemyProjectiles = st.projectiles.filter((p) => p.faction === 'enemy')

          if (dist > range && enemyProjectiles.length > 0) {
            firedOutsideRange = true
            break
          }
          if (enemyProjectiles.length > 0) {
            shooterFired = true
            fireDist = dist
            break
          }
        }
        return { found: true, firedOutsideRange, shooterFired, fireDist }
      },
      { maxSteps: 600, stepMs: STEP_MS, range: attackRange },
    )

    expect(result.found).toBe(true)
    expect(result.firedOutsideRange).toBe(false)
    expect(result.shooterFired).toBe(true)
    expect(result.fireDist).toBeLessThanOrEqual(attackRange)
  })
})
