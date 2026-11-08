import { defineConfig, devices } from "@playwright/test";

// `E2E_PORT` runs the suite against a dev server on another port (for
// example from a second checkout while `npm run dev` holds 3000).
const port = Number(process.env.E2E_PORT ?? 3000);
const baseURL = `http://localhost:${port}`;

// X-01 (PRD QA-1, QA-2, QA-4): `QA=1` adds the cross-browser and phone
// projects and the public-page QA sweep (tests/e2e/qa.spec.ts). Without it
// the run stays Chromium-only and skips that sweep, so `npm run test:e2e`
// stays fast. Needs `npx playwright install firefox webkit` once.
//
//   QA=1 npm run test:e2e -- qa.spec.ts                      # every project
//   QA=1 npm run test:e2e -- qa.spec.ts --project=webkit     # one browser
const QA = process.env.QA === "1";

export default defineConfig({
  testDir: "tests/e2e",
  testIgnore: QA ? undefined : "qa.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    ...(QA
      ? [
          { name: "firefox", use: { ...devices["Desktop Firefox"] } },
          { name: "webkit", use: { ...devices["Desktop Safari"] } },
          { name: "mobile-chrome", use: { ...devices["Pixel 7"] } },
          { name: "mobile-safari", use: { ...devices["iPhone 14"] } },
        ]
      : []),
  ],
  webServer: {
    command: port === 3000 ? "npm run dev" : `npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // A cold `nuxt dev` (first compile) can take longer than the 60 s default.
    timeout: 180_000,
  },
});
