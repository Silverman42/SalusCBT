# T-209 · Answer-key leak test over every student function

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-208](T-208-review-queries.md) |
| Requirements | `SE-1` |
| Design refs | LLD §17 (leak row); PRD success metric |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

An automated guard that fails the build if any student-reachable function returns key data before submission.

## Steps

- Enumerate every public query/mutation a student can call (attempts.*, review.*, shareLinks.*, content.*, classes.lookupCode).
- Seed an in-progress attempt; call each; fail if JSON contains any `correct`, key `parts` value or `explanation` text.
- Make the list self-checking: fail if a new public function isn't classified.

## Files

- `tests/convex/leak.test.ts`

## Acceptance criteria

- [ ] Test runs in CI and passes.
- [ ] Adding a new unclassified public function fails the test.
