# T-509 · Extra-time multiplier per class (EX-21)

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-002](../stage-0-decisions/T-002-resolve-prd-suggestions.md), [T-501](T-501-classes-backend.md), [T-214](../stage-2-exam-engine/T-214-timer-pacing.md) |
| Requirements | `EX-21` |
| Design refs | LLD §3.1 (`classes.timeMultiplier`), §14.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Accessibility accommodation: a class can give 1.25×, 1.5× or 2× time.

## Steps

- Multiplier picker on class create/edit.
- `attempts.start` uses `class.timeMultiplier` for the deadline.
- Pacing checkpoints scale with the multiplier.

## Files

- `convex/classes.ts`
- `convex/attempts.ts`
- `app/pages/tutor/*`

## Acceptance criteria

- [x] A 1.5× class gets a 135-minute deadline and scaled pacing alerts.

## Notes

- EX-21 accepted on 2026-11-08; this task is in scope.
- 2026-11-08 (finishing): the deadline (`attempts.start`, tested 1/1.25/1.5/2× → 90/112.5/135/180 min in `tests/convex/attempts/start.test.ts`) and scaled pacing (`app/lib/pacing.ts`, T-214) were already in place; the gap was the start screen, which always said 90 minutes.
- New public query `attempts.startInfo({ classCode? })` → `{ minutes, timeMultiplier, retake } | null`: minutes = `exams.timeLimitMin × timeMultiplier` (unrounded, like the deadline), for the default exam or an open class; null for an unknown/closed code or no published version. Added to `tests/convex/leak.test.ts` (STUDENT_FACING + scan) and `tests/convex/auth/access.test.ts` (public). `classes.lookupCode` is unchanged: its `toEqual({ name, open })` assertions live in `tests/convex/classes/classes.test.ts` (T-510's), and the default exam's minutes and retake availability needed a no-class answer anyway.
- `/start` shows the effective minutes in the intro, the timer item ("Your class has extra time: 135 minutes instead of 90."), the pacing alert times (scaled with `checkpoints()`, e.g. 38/68/98/120 for 1.5×) and the footer. Not live-checked with a real class (the dev deployment has no classes; I didn't write any).

