/**
 * X-01: cross-browser, phone-width and accessibility sweep of every page that
 * renders without SERVER_SECRET or a staff sign-in (PRD QA-1, QA-2, QA-4).
 *
 * For each page, in light and dark mode, at 375 px and 1280 px on the
 * desktop projects (Chromium, Firefox, WebKit) and at the device width on
 * the phone projects (Pixel 7, iPhone 14):
 *
 * - axe: no serious or critical WCAG 2.x A/AA violations;
 * - no horizontal page scroll;
 * - no console errors or uncaught exceptions, no CSP violation and no
 *   request to the Iconify API (icons ship in the client bundle);
 * - the first Tab stop gets a visible focus indicator;
 * - the theme toggle switches the theme.
 *
 * Only runs with `QA=1` (see playwright.config.ts):
 *
 *   QA=1 npm run test:e2e -- qa.spec.ts
 *
 * The exam runner, PBQs, a real result and the staff pages need a live
 * deployment or an account; exam.spec.ts, pbq.spec.ts, auth.spec.ts,
 * classes.spec.ts and editor.spec.ts run axe there.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";

interface QaPage {
  path: string;
  /** Where the page settles (redirects). Defaults to `path`'s pathname. */
  lands?: RegExp;
  /** Console errors this page is expected to log. */
  allowConsole?: RegExp[];
}

const CSP_MESSAGE = /Content[- ]Security[- ]Policy|CSP violation/i;
const NOT_FOUND_DOCUMENT = /Failed to load resource: the server responded with a status of 404/;

// The auth pages ask Better Auth for the session; a full matrix run (about
// 120 page loads from one IP) can trip its per-IP rate limit. The page
// still renders signed out, which the other checks cover.
const AUTH_RATE_LIMIT = /status of 429/;

const PAGES: QaPage[] = [
  { path: "/" },
  { path: "/start" },
  { path: "/start?mode=retake" },
  { path: "/start?class=SEC-ZZZZ" },
  { path: "/privacy" },
  { path: "/lab" },
  { path: "/sign-in", allowConsole: [AUTH_RATE_LIMIT] },
  { path: "/invite/bogus", allowConsole: [AUTH_RATE_LIMIT] },
  { path: "/history" },
  { path: "/exam/bogus" },
  { path: "/exam/bogus/result" },
  { path: "/exam/bogus/review" },
  // Unknown share links get a real 404 document (CL-9).
  { path: "/r/bogus", allowConsole: [NOT_FOUND_DOCUMENT] },
  // Signed out: the staff middleware sends both to /sign-in.
  { path: "/tutor", lands: /\/sign-in/, allowConsole: [AUTH_RATE_LIMIT] },
  { path: "/admin/tutors", lands: /\/sign-in/, allowConsole: [AUTH_RATE_LIMIT] },
];

const DESKTOP_WIDTHS = [375, 1280] as const;

async function settle(page: Page, { path, lands }: QaPage) {
  const response = await page.goto(path);
  expect(response, `no response for ${path}`).not.toBeNull();
  await expect(page).toHaveURL(lands ?? new RegExp(path.split("?")[0]!.replace(/\//g, "\\/")));
  // Let hydration, client-only parts and Convex queries settle.
  await page.waitForLoadState("networkidle");
  await expect(page.locator("h1").first()).toBeVisible();
  // ThemeToggle is <ClientOnly>: once it is there the page has hydrated.
  await expect(page.getByRole("button", { name: /Switch to (light|dark) theme/ })).toBeVisible();
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`QA sweep, ${scheme} mode`, () => {
    test.use({ colorScheme: scheme });

    for (const qaPage of PAGES) {
      test(`${qaPage.path}`, async ({ page, browserName }, testInfo) => {
        const isPhone = testInfo.project.use.isMobile === true;
        const widths = isPhone ? [page.viewportSize()!.width] : DESKTOP_WIDTHS;

        const errors: string[] = [];
        page.on("console", (msg) => {
          const text = msg.text();
          // Some engines log CSP blocks as warnings: count them whatever the level.
          if (msg.type() !== "error" && !CSP_MESSAGE.test(text)) return;
          if (qaPage.allowConsole?.some((re) => re.test(text))) return;
          errors.push(`console: ${text}`);
        });
        page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
        // Icons ship in the client bundle; the CSP blocks the Iconify API (T-218).
        page.on("request", (req) => {
          if (/(^|\.)iconify\.design$/.test(new URL(req.url()).hostname)) {
            errors.push(`iconify request: ${req.url()}`);
          }
        });
        await page.addInitScript(() => {
          document.addEventListener("securitypolicyviolation", (e) => {
            console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
          });
        });

        for (const width of widths) {
          await test.step(`${width}px`, async () => {
            if (!isPhone) await page.setViewportSize({ width, height: 900 });
            await settle(page, qaPage);
            await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${scheme}\\b`));

            await expectNoSeriousA11yViolations(page, testInfo, `${scheme}-${width}${qaPage.path}`);

            const overflow = await page.evaluate(() => ({
              scroll: document.documentElement.scrollWidth,
              inner: window.innerWidth,
            }));
            expect(overflow.scroll, `horizontal scroll at ${width}px`).toBeLessThanOrEqual(
              overflow.inner,
            );

            // WebKit only tabs to links with Option held (Safari's default).
            await page.locator("body").focus();
            await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
            const focus = await page.evaluate(() => {
              const el = document.activeElement as HTMLElement | null;
              if (!el || el === document.body) return null;
              const style = getComputedStyle(el);
              return {
                tag: el.tagName,
                text: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 40),
                outline: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0,
                ring: style.boxShadow !== "none",
              };
            });
            expect(focus, "Tab focuses an element").not.toBeNull();
            expect(focus!.outline || focus!.ring, `focus visible on ${JSON.stringify(focus)}`).toBe(
              true,
            );

            const other = scheme === "light" ? "dark" : "light";
            await page.getByRole("button", { name: `Switch to ${other} theme` }).click();
            await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${other}\\b`));
            await expect(
              page.getByRole("button", { name: `Switch to ${scheme} theme` }),
            ).toBeVisible();
            // Back to the scheme under test for the next width.
            await page.getByRole("button", { name: `Switch to ${scheme} theme` }).click();
            await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${scheme}\\b`));
          });
        }

        expect(errors, "console errors").toEqual([]);
      });
    }
  });
}
