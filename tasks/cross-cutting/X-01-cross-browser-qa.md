# X-01 · Cross-browser, phone-width and accessibility pass

| | |
| --- | --- |
| Stage | X · Cross-cutting |
| Depends on | [T-309](../stage-3-pbqs/T-309-pbq-review-and-e2e.md) |
| Requirements | `QA-1`, `QA-2`, `QA-4` |
| Design refs | HLD §9 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

MVP release check across browsers and devices.

## Steps

- Full sitting on current Chrome, Edge, Safari and Firefox.
  360 px width: exam runner, navigator, all five PBQs.
- Keyboard-only full sitting; screen reader spot check; dark and light themes.

## Files

- `tests/e2e/playwright.config.ts (projects)`

## Acceptance criteria

- [ ] No blocking issues on any target browser.
- [ ] WCAG 2.2 AA target met on exam screens.

Neither box is ticked yet: both need the live pass below (Firefox, and the
exam screens with a real attempt).

## Notes

### Automated sweep (`tests/e2e/qa.spec.ts`)

`QA=1` adds Playwright projects `firefox`, `webkit`, `mobile-chrome`
(Pixel 7, 412 px) and `mobile-safari` (iPhone 14, 390 px) next to `chromium`,
and enables the sweep. Without `QA=1` the run is Chromium-only and skips
`qa.spec.ts`, so `npm run test:e2e` and the (disabled) CI e2e job don't change.

    npx playwright install firefox webkit                  # once
    QA=1 npm run test:e2e -- qa.spec.ts                    # every project
    QA=1 npm run test:e2e -- qa.spec.ts --project=webkit   # one project
    QA=1 E2E_PORT=4900 npm run test:e2e -- qa.spec.ts      # dev server on another port

Pages (none need SERVER_SECRET or a sign-in): `/`, `/start`,
`/start?mode=retake`, `/start?class=SEC-ZZZZ`, `/privacy`, `/lab`, `/sign-in`,
`/invite/bogus`, `/history` (empty), `/exam/bogus` and its `/result` and
`/review` (not-found states), `/r/bogus` (404 document), and `/tutor` and
`/admin/tutors` (signed-out redirect to `/sign-in`). Each in light and dark
mode, at 375 px and 1280 px on the desktop projects and at the device width
on the phone projects. Checks: axe (WCAG 2.x A/AA, zero serious or critical);
no horizontal page scroll; no console errors or uncaught exceptions, no CSP
violation and no request to `*.iconify.design`; the first Tab stop has a
visible focus indicator (Option+Tab on WebKit, as in Safari); the theme
toggle switches the theme both ways.

Result (2026-11-08): 120/120 on Chromium, WebKit, Pixel 7 and iPhone 14,
plus `a11y.spec.ts` 40/40 on the same four projects.

**Firefox not run here**: Playwright's Firefox 159 build (`firefox-1572`)
exits with "Could not find profile folder" on this Mac (Darwin 27.2) even when
started by hand with an existing profile, so it's an environment problem, not
the app. Run `QA=1 npm run test:e2e -- qa.spec.ts --project=firefox` on
another machine or in CI. Edge is Chromium: the `chromium` project covers its
engine, but not Edge itself.

### Issues found and fixed

- Icons named in `.ts` files (`app/lib/*`, `app/composables/*`: the result
  pages' `search-x`, staff nav `message-circle`/`pen-line`, admin audit icons
  …) weren't in the client bundle. @nuxt/icon's default scan covers only
  `.vue/.jsx/.tsx/.md/.yml`, so the browser asked api.iconify.design, the CSP
  blocked it and the icon was blank. `nuxt.config.ts` now scans
  `app/**/*.{vue,ts}`. Nuxt UI's own icons were already bundled (via its
  `icon:clientBundleIcons` hook). `tests/unit/icons.test.ts` checks the
  scan setting, that every `i-lucide-*` name exists in `@iconify-json/lucide`
  and that no icon name is built at runtime.
- `/lab` command blocks scroll sideways at phone width but couldn't be
  reached by keyboard (axe `scrollable-region-focusable`, serious). They now
  have `tabindex="0"`, a label and a focus ring. Same fix for the scrollable
  scenario blocks in `ReviewItem.vue` (review page, live data only).
- Soft primary buttons (e.g. "Salus home" on `/invite/bogus`) were #6140FF
  on primary/10: 4.49:1 in light mode. `app.config.ts` gives primary soft and
  subtle buttons `text-brand-ink`, the mockup's `--pri` on `--prs`.
- Oversized radii: with `--ui-radius: 1rem` Nuxt UI's named scale is
  sm 16 · md 24 · lg 32 · xl 48 · 2xl 64 · 3xl 96 px, so the logo tile (38 px,
  `rounded-xl`) rendered as a circle, notice rows and the field base as pills,
  and inline code as a pill. Every `rounded-md/xl/2xl/3xl` under `app/` now
  uses the mockup's px value: logo tiles 12, icon tiles 14/18, fields,
  notice rows and staff nav items 16, code blocks 18, notes, stat tiles
  (`ResultSummary`) and the invite note 24, inline code 6. The input
  base in `app.config.ts` went from `rounded-2xl` to `rounded-[16px]`.

The auth pages can log a 429 from Better Auth's per-IP rate limit when the
whole matrix runs from one IP; the sweep allows it on those four pages only.

### Still needs live data or a person

- Exam runner, navigator and all ten PBQs at 360 px, keyboard-only sitting,
  result with a real attempt: `exam.spec.ts` and `pbq.spec.ts` run axe there
  (Chromium) once SERVER_SECRET is set (`E2E_EXAM=1`). Running them with
  `QA=1 --project=…` also covers WebKit and the phones.
- Staff pages signed in (`/tutor/**`, `/admin/**`): `auth.spec.ts`,
  `classes.spec.ts` and `editor.spec.ts`, which need accounts.
- Screen reader spot check (VoiceOver on Safari, NVDA on Firefox), real
  Safari/Edge/Firefox rather than Playwright engines, and a real phone.
- T-509's "112.5 minutes" wording: not reachable without a class; check on
  `/start` with a real 1.25× class code (`app/lib/start.ts` formats it).
