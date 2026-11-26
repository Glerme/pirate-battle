import { expect, gotoApp, test } from '../fixtures'

test('menu loads', async ({ page }) => {
  await gotoApp(page)
  await expect(page.getByText('Pirate Battle').first()).toBeVisible()
})
