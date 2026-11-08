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
