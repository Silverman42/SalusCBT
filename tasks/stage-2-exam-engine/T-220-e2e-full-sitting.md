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
