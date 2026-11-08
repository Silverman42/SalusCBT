# T-205 · attempts.getPaper and attempts.getState

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-204](T-204-attempts-start.md) |
| Requirements | `EX-6`, `EX-10`, `EX-11`, `SE-1`, `SE-3` |
| Design refs | LLD §7.3, §5.1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Give the student their paper with no answer data, and the saved state for refreshes.

## Steps

- `getPaper`: `loadOwnAttempt`; read `questions` only (never `answerKeys`); PBQs first, then MCQs by number; shuffle options with `questionSeed(attempt.shuffleSeed, q._id)`; keep original option ids; shuffle PBQ MCQ parts too.
- `getState`: `{ status, deadline, serverNow, responses[] }` (value + flagged only, no `earned`/`partResults` before submit).

## Files

- `convex/attempts.ts`

## Acceptance criteria

- [ ] Same attempt always returns the same option order.
- [ ] Other tokens get `NOT_FOUND`.
- [ ] No key or explanation fields in the response.
