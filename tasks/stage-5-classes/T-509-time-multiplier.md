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

- [ ] A 1.5× class gets a 135-minute deadline and scaled pacing alerts.

## Notes

- EX-21 accepted on 2026-11-08; this task is in scope.
