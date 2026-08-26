import { defineConfig, devices } from '@playwright/test';

// Runs against the PRODUCTION build, not the dev server: that is what validates
// prerendering, asset paths, and any production-only failure the dev server
// would conceal.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    // Includes the deployment sub-path, so tests exercise the real URLs.
    baseURL: 'http://localhost:4322/ai-education-weekly/',
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `astro preview` daemonizes and exits, which Playwright reads as a crashed
    // web server, so the built output is served by a plain foreground static
    // server instead. Same dist/, same production artifacts.
    // sirv serves dist/ at the root, but Pages serves it under /<repo>/. A
    // wrapper directory reproduces that, so the browser suite exercises the
    // same URLs production will. Copied rather than symlinked — sirv does not
    // follow a symlinked root.
    command:
      'npx astro build && rm -rf .preview && mkdir -p .preview && cp -R dist .preview/ai-education-weekly && npx sirv .preview --port 4322 --quiet',
    // The health check has to hit the sub-path; the server root is empty now.
    url: 'http://localhost:4322/ai-education-weekly/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
