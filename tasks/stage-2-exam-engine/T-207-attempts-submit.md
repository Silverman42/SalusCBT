# T-207 · Submit, auto-submit and the safety-net sweep

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-202](T-202-marking-score.md), [T-206](T-206-attempts-save.md) |
| Requirements | `EX-3`, `EX-13`, `EX-16`, `SE-4` |
| Design refs | LLD §7.4, §12.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Mark attempts on the server exactly once, whether the student submits or time runs out.

## Steps

- Implement `finalise(ctx, attempt, by)` per §7.4 (idempotent; writes `earned`/`partResults`; `submittedAt = min(now, deadline)`; result with `flaggedCount`, `timeUsedSec`).
- `attempts.submit` (anon) and internal `attempts.autoSubmit` both call it; cancel the scheduled job on student submit.
- Cron `sweepOpenAttempts` every 10 min: finalise `in_progress` attempts past `deadline + 60 s` (`by_status_deadline`).

## Files

- `convex/attempts.ts`
- `convex/crons.ts`

## Acceptance criteria

- [ ] Double submit returns the same result.
- [ ] Unanswered questions score 0.
- [ ] Auto-submit marks `submittedBy = timer`.

## Tests

- convex-test with fake timers: submit, auto-submit, race of both, sweep.
