import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests/e2e',
  snapshotPathTemplate: 'tests/e2e/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  reporter: [['html'], ['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7 landscape'] } },
  ],
  webServer: { command: 'pnpm build && pnpm preview --port 4173', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
})
