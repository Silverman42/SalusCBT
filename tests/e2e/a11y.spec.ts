/**
 * T-220: axe scan of the public pages (PRD QA-2, LLD §17 Accessibility row):
 * no serious or critical WCAG 2.x A/AA violations, in light and dark mode.
 *
 * Runs without any deployment setup: these pages render without
 * SERVER_SECRET (they read Convex at most for the anonymous history list).
 * The exam runner, its review screen and the result and review pages are
 * scanned by tests/e2e/exam.spec.ts, which needs a live deployment.
 */
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";

const PAGES = [
  { path: "/", heading: /./ },
  { path: "/start", heading: "Before you start" },
  { path: "/privacy", heading: /./ },
  { path: "/lab", heading: /./ },
  { path: "/sign-in", heading: /./ },
] as const;

for (const scheme of ["light", "dark"] as const) {
  test.describe(`axe, ${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    for (const { path, heading } of PAGES) {
      test(`${path} has no serious or critical violations`, async ({ page }, testInfo) => {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1, name: heading }).first()).toBeVisible();
        // Let hydration and client-only parts (identity, history) settle.
        await page.waitForLoadState("networkidle");
        if (path === "/start") {
          await expect(page.getByRole("button", { name: "Start the exam" })).toBeEnabled();
        }
        await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${scheme}\\b`));
        await expectNoSeriousA11yViolations(page, testInfo, `${scheme}${path}`);
      });
    }
  });
}
