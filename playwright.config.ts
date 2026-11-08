import { defineConfig, devices } from "@playwright/test";

// `E2E_PORT` runs the suite against a dev server on another port (for
// example from a second checkout while `npm run dev` holds 3000).
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: port === 3000 ? "npm run dev" : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // A cold `nuxt dev` (first compile) can take longer than the 60 s default.
    timeout: 180_000,
  },
});
