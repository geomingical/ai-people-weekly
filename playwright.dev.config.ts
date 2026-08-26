import { defineConfig, devices } from '@playwright/test';

// Fast local loop against the dev server. `npm run verify` uses the production
// config above; this one exists only to keep iteration quick.
export default defineConfig({
  testDir: './tests/e2e',
  reporter: 'list',
  use: { // Includes the deployment sub-path, so tests exercise the real URLs.
    baseURL: 'http://localhost:4323/ai-education-weekly/' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx astro dev --port 4323',
    url: 'http://localhost:4323',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
