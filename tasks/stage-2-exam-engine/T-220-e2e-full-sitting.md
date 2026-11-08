# T-220 · E2E: full sitting, refresh, timer expiry, accessibility

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-213](T-213-exam-runner-ui.md), [T-214](T-214-timer-pacing.md), [T-215](T-215-results-page.md), [T-216](T-216-review-page.md) |
| Requirements | `EX-*`, `QA-2` |
| Design refs | LLD §17 (End to end, Accessibility rows) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Prove the Stage 2 gate in a real browser.

## Steps

- Playwright: start → answer → refresh mid-exam → submit → result → review.
- Timer expiry with a shortened test time limit.
- axe checks on the runner and navigator (no serious violations).

## Files

- `tests/e2e/exam.spec.ts`

## Acceptance criteria

- [ ] **Stage 2 gate:** full sitting works; scoring tests pass; leak test passes (T-209).
  - [x] Scoring tests pass (83 = 751 Pass, 82 = 743 Below 750) and the T-209 leak test passes (`npm test`, 2026-11-08).
  - [x] axe: no serious/critical violations on `/`, `/start`, `/privacy`, `/lab`, `/sign-in`, light and dark (`tests/e2e/a11y.spec.ts`, run 2026-11-08).
  - [ ] Full sitting, refresh, timer expiry and axe on the runner/review/result pages in the browser (`tests/e2e/exam.spec.ts`): written, not yet run live (needs `SERVER_SECRET`, see Notes).

## Notes

- `tests/e2e/exam.spec.ts` (skipped unless `E2E_EXAM=1`):
  - 83-point sitting: /start → every MCQ answered from the seed keys (clicks and A–E keys, Q10 flagged, Q7 and Q20 wrong) → refresh after Q48 (server `getState` holds every answer; the same question, answers and navigator count come back) → review screen (85 / 1 / 5) → Submit → 751 Pass, 83 of 102 → review page (the wrong picks marked) → /history. axe on /start, runner (PBQ and MCQ views with the navigator), review screen, result, review page. Every Convex WebSocket frame received before submitting is checked for answer-key-only text (SE-1).
  - 82-point sitting (Q61 wrong too): 743, Below 750.
  - Timer expiry: there is no shorter test time limit (class multipliers are ≥ 1 and no backend hook was added), so `page.clock.install()` + `fastForward` moves the page clock 80 then 90+ minutes on. The runner shows the last-ten-minutes timer, then at 0:00 submits by itself and opens the result. This is the client path only: the server accepts the student submit before its real deadline, so the result is "by the student" at real time. The server path (`autoSubmit` at deadline + 30 s, the sweep) stays covered by the convex-test suites (T-207).
  - PBQs are left blank, so the MCQs alone set the score (85 MCQ points).
- Running the live suite: `npx convex env set SERVER_SECRET <random>`; in `.env.local` `NUXT_SERVER_SECRET=<same>` and `NUXT_IP_PEPPER=<random>`; a published default version (`npm run seed:import`); then `E2E_EXAM=1 npm run test:e2e -- exam.spec.ts`. `E2E_PORT=<port>` (new in `playwright.config.ts`) runs against a dev server on another port.
- axe fixes in `app/assets/css/main.css` (colour contrast only): light `--salus-warn` #9A6408 → #8F5E07 (4.39 → 4.89:1 on `--salus-warns`); dark `--ui-primary` → salus-400 #9C88FF, so Nuxt UI solid buttons (dark text, 4.19 → 6.8:1) and soft/link buttons (3.53 → 5.7:1) pass. App components using `bg-brand` keep #7457FF.
- Shared e2e helpers live in `tests/e2e/helpers/` (`convex.ts`: Convex URL and `MailLog`, now used by auth.spec and classes.spec too; `axe.ts`; `exam.ts`). `tests/e2e/tsconfig.json` type-checks them with `npx tsc -p tests/e2e`; it isn't part of `npm run typecheck` yet.
