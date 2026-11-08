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

- [x] Double submit returns the same result.
- [x] Unanswered questions score 0.
- [x] Auto-submit marks `submittedBy = timer`.

## Tests

- convex-test with fake timers: submit, auto-submit, race of both, sweep.

## Notes

- `finalise(ctx, attempt, by)` in `convex/attempts.ts` is shared by `submit`, `autoSubmit` and `sweepOpenAttempts`. Not `in_progress` → returns the stored `result` (or `null`); no error, no writes. Status goes to `submitted` for both paths; `submittedBy` tells them apart (the schema has no `auto_submitted` status).
- Keys are read with `answerKeys.by_version` (95 rows) and only those on the attempt's paper are used (retake → set B). A question with no key scores 0 and is logged with `console.error` listing question ids only (no answer or key data).
- Each response row on the paper gets `earned` (capped at the question's points) and `partResults` (PBQs). Cleared rows (no `value`) and flag-only rows earn 0. Questions with no row get no row (D9); T-208 treats them as 0.
- `flaggedCount` counts flagged response rows on the paper; `timeUsedSec = round((min(now, deadline) − startedAt) / 1000)`.
- A student submit is allowed after the deadline (answers are frozen at `deadline + 30 s` anyway) and is still `submittedBy: "student"`, with `submittedAt` capped at the deadline. It cancels the timer job only if it is still `pending`.
- `submit` returns the `attempts.result` object only (validator `attemptResultValidator`, now exported from `convex/schema.ts` for T-208). `ATTEMPT_CLOSED` only for a closed attempt with no result (`expired`, which nothing sets yet).
- Sweep: `crons.interval("sweepOpenAttempts", { minutes: 10 })`, `by_status_deadline` with `deadline < now − 60 s`, oldest first, 10 per run; a full batch reschedules itself with `runAfter(0)`. One finalise reads ~280 docs (~150 KB for the whole seed) and writes ≤ 91, well inside a mutation's limits.
- `convex/crons.ts` is new here; T-219 (`purgeIpHashes`) and the invitations expiry cron add their lines to it.
- Tests: `tests/convex/attempts/submit.test.ts` (20 cases: real-seed scoring incl. 102 → 900, 83 → 751 pass, 82 → 743 fail; retake set B; marks on rows; missing key; idempotency; SE-1 result shape; job cancel; ATTEMPT_CLOSED after submit; NOT_FOUND / BAD_TOKEN; late submit; timer via fake timers + `finishAllScheduledFunctions`; both race orders; sweep for a lost job and batching).
