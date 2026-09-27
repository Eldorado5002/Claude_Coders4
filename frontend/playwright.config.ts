import { defineConfig } from '@playwright/test'

// Smoke test of the demo path in fixture mode (no backend needed): npm run e2e
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: { baseURL: 'http://localhost:5174', channel: 'chrome', viewport: { width: 1440, height: 900 } },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    env: { VITE_FIXTURES: '1' },
    timeout: 60_000,
  },
})
