# T-502 · Class dashboard queries: attempts, stats, attempt review

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-501](T-501-classes-backend.md), [T-208](../stage-2-exam-engine/T-208-review-queries.md) |
| Requirements | `CL-5`, `CL-6`, `CL-7` |
| Design refs | LLD §5.2; HLD §5.4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Live data for the tutor dashboard.

## Steps

- `classes.attempts({ classId, filter? })`: name, date, score, pass/fail, time used; live via `by_class`.
- `classes.stats`: average scaled, pass rate, class domain breakdown, 10 most-missed questions (exclude preview attempts).
- `classes.attemptReview({ attemptId })`: same `ReviewItem[]` as students, class must be the caller's.

## Files

- `convex/classes.ts`

## Acceptance criteria

- [ ] New submission appears on an open dashboard in < 5 s.

  Not ticked: needs the Playwright check in [T-510](T-510-classes-tests.md). The backend half is in place: all four queries are plain reactive queries over the `by_class` index, so a submit patching the attempt re-runs an open subscription straight away. convex-test (`tests/convex/classes/dashboard.test.ts`) confirms the row shows its score as soon as the submit commits.

## Notes

- Functions in `convex/classes.ts`. The pure row and stats logic is in `convex/lib/classStats.ts`.
- `classes.attempts({ classId, filter? })` → `AttemptRow[]`, newest first by `startedAt`, capped at `CLASS_ATTEMPTS_LIMIT` (1000). `filter`: `all | in_progress | submitted | expired | passed | failed`. The status filter runs after the index read; a real class is far below the cap. Rows have the display name, mode, status, start/deadline/submit times, `submittedBy`, plus `scaled`, `passed`, `points`, `totalPoints`, `timeUsedSec` and `flaggedCount` once marked. In-progress rows show no "questions answered" count: that would mean reading responses for every row and re-running the dashboard on every student save.
- `classes.stats({ classId })` covers marked attempts only: `submittedCount`, `passedCount`, `passRate`, `avgScaled`/`medianScaled` (1 dp), `domains[]` (points/max summed over the class, `share`, `belowTarget` against `exam.domainTarget`), `mostMissed[10]` (miss = not full marks; no response row counts as a miss), `attemptCount`, `inProgressCount`, `passScaled`, `domainTarget`, `truncated`. Most-missed reads responses for the newest `MOST_MISSED_SAMPLE` (150) marked attempts only, to stay inside the per-query read limits. `mostMissedSample` reports how many attempts that was. Preview attempts have no `classId`, so `by_class` never returns them.
- `classes.attemptReview({ attemptId })` returns `buildReview`, the same thing `review.getReview` returns (a test asserts they are equal). Added `classes.attemptResult({ attemptId })` (`buildResult` + `displayName`, `classId`, `className`) so T-506 can render the result header the way the student page does. Both return `NOT_FOUND` for in-progress or expired attempts, for another tutor's class, and for attempts with no class (also for the admin).
- Privacy: rows are built field by field, so no `anonKey`, `ipHash`, `shuffleSeed` or job id ever reaches a tutor (tested).
- Follow-up if classes get large: a per-class aggregate (e.g. `@convex-dev/aggregate`, or a per-class per-question tally written at submit) would remove both caps.
