# T-204 · attempts.start mutation

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-106](../stage-1-setup/T-106-core-libs.md), [T-109](../stage-1-setup/T-109-seed-import.md) |
| Requirements | `EX-1`, `EX-3`, `EX-11`, `CL-4`, `PB-4`, `SE-5`, `EX-21` |
| Design refs | LLD §7.1; HLD §5.1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Create an attempt with a server-set start time and deadline, and schedule auto-submit.

## Steps

- Constant-time check of `serverSecret` vs `SERVER_SECRET`.
- Rate limits `attemptStartAnon` 10/hour and `attemptStartIp` 200/hour.
- Class code: upper-case, strip spaces, `by_code`, must be `open`, `displayName` 1–40 chars required. Else default version, multiplier 1.
- `mode = retake` uses `pbqB` instead of `pbqA`.
- Insert attempt with `deadline = now + timeLimitMin × 60 000 × multiplier`, random `shuffleSeed`.
- Schedule `autoSubmit` at `deadline + 30 000`; store `autoSubmitJobId`.

## Files

- `convex/attempts.ts`

## Acceptance criteria

- [ ] Bad secret → rejected.
- [ ] 11th start in an hour → `RATE_LIMITED`.
- [ ] Closed class → `CLASS_CLOSED`.
- [ ] Deadline is server-computed.

## Tests

- convex-test for each case above.

## Notes

- EX-21 is accepted. Use `class.timeMultiplier`; classes default to 1 until T-509 adds the picker.
