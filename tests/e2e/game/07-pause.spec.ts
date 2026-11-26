import { expect, test } from '../fixtures'
import { advance, getState, startMatch, STEP_MS } from './helpers'

test.describe('07 - Manual pause, blur & visibilitychange auto-pause, frozen timer and clean resume', () => {
  test('pauses manually via HUD button or keyboard, freezes timer, and resumes only on player action without accumulated movement', async ({ page }) => {
    await startMatch(page, { seed: 42, sessionTimeSec: 120, spawnIntervalSec: 15 })

    // Hold forward movement, advance 500ms, then pause while forward is still held
    await page.keyboard.down('w')
    const beforePause = await advance(page, 500)
    expect(beforePause.simTimeMs).toBeGreaterThan(0)

    await page.getByRole('button', { name: 'Pause' }).click()
    await page.keyboard.up('w')

    const pausedDialog = page.getByRole('dialog', { name: 'Paused' })
    await expect(pausedDialog).toBeVisible()

    const pausedState = await getState(page)
    expect(pausedState.status).toBe('paused')
    expect(pausedState.pauseReason).toBe('manual')

    // Advancing the clock while paused must not advance simTimeMs, timer, or ship position
    const afterPausedAdvance = await advance(page, 10_000)
    expect(afterPausedAdvance.simTimeMs).toBe(pausedState.simTimeMs)
    expect(afterPausedAdvance.remainingSec).toBe(pausedState.remainingSec)
    expect(afterPausedAdvance.ships[0]?.y).toBe(pausedState.ships[0]?.y)

    // Resume requires clicking Resume in the dialog
    await pausedDialog.getByRole('button', { name: 'Resume' }).click()
    await expect(pausedDialog).toBeHidden()

    const resumedState = await getState(page)
    expect(resumedState.status).toBe('running')

    // Advancing 1 step after resume without holding keys must not apply stale pre-pause forward input or accumulated time
    const afterResumeStep = await advance(page, STEP_MS)
    expect(afterResumeStep.simTimeMs - resumedState.simTimeMs).toBeCloseTo(STEP_MS, 2)
    expect(afterResumeStep.ships[0]?.y).toBe(resumedState.ships[0]?.y)
    expect(afterResumeStep.projectiles).toHaveLength(0)
  })

  test('auto-pauses on window blur and document visibilitychange, and requires manual Resume action', async ({ page }) => {
    await startMatch(page, { seed: 42, sessionTimeSec: 120, spawnIntervalSec: 15 })
    await advance(page, 1000)

    // 1. Trigger window blur via page.evaluate
    await page.evaluate(() => {
      window.dispatchEvent(new Event('blur'))
    })

    const pausedDialog = page.getByRole('dialog', { name: 'Paused' })
    await expect(pausedDialog).toBeVisible()

    let state = await getState(page)
    expect(state.status).toBe('paused')
    expect(state.pauseReason).toBe('blur')
    const timeAtBlur = state.simTimeMs

    // Clock does not advance during blur pause
    state = await advance(page, 5000)
    expect(state.simTimeMs).toBe(timeAtBlur)

    // Resume via player action
    await pausedDialog.getByRole('button', { name: 'Resume' }).click()
    await expect(pausedDialog).toBeHidden()
    expect((await getState(page)).status).toBe('running')

    // 2. Trigger visibilitychange (hidden -> visible) via page.evaluate
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await expect(pausedDialog).toBeVisible()
    state = await getState(page)
    expect(state.status).toBe('paused')
    expect(state.pauseReason).toBe('hidden')

    // Returning tab to visible must NOT auto-resume; player action is still required
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
      document.dispatchEvent(new Event('visibilitychange'))
    })

    state = await advance(page, 5000)
    expect(state.status).toBe('paused')
    expect(state.simTimeMs).toBe(timeAtBlur)

    await pausedDialog.getByRole('button', { name: 'Resume' }).click()
    await expect(pausedDialog).toBeHidden()
    state = await advance(page, 1000)
    expect(state.status).toBe('running')
    expect(state.simTimeMs).toBeGreaterThan(timeAtBlur + 900)
  })
})
