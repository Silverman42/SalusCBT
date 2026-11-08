# T-214 · Timer, time calls and pacing alerts

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-212](T-212-useAttempt.md) |
| Requirements | `EX-3`, `EX-4`, `EX-5`, `EX-21` |
| Design refs | LLD §14.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Always-visible countdown and the proctor guide's pacing nudges.

## Steps

- `Timer` component from `useAttempt` remaining time; submit at 0:00.
- `app/lib/pacing.ts`: checkpoints at 25/45/65/80 min elapsed (× multiplier) with the LLD conditions; time calls at 45/15/5 min remaining.
- `PacingBanner`: each shows once, dismissible, announced to screen readers.

## Files

- `app/lib/pacing.ts`
- `app/components/exam/Timer.vue`
- `app/components/exam/PacingBanner.vue`

## Acceptance criteria

- [ ] At 0:00 the attempt submits; if that fails the result page still loads after auto-submit.

## Tests

- Vitest for `pacing.ts` with each condition true/false and multiplier 1 and 1.5.
