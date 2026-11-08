# T-206 · attempts.saveResponse

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-205](T-205-attempts-paper-state.md) |
| Requirements | `EX-7`, `EX-11`, `SE-3`, `SE-4` |
| Design refs | LLD §7.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Save each answer and flag change on the server, with strict checks.

## Steps

- `loadOwnAttempt`; must be `in_progress` and `now ≤ deadline + 30 000`, else `ATTEMPT_CLOSED`.
- Question must be in the attempt's version and section set.
- Validate value shape (option ids exist, ≤ `chooseCount`; PBQ part ids exist; strings ≤ 200 chars).
- Upsert `responses` by `(attemptId, questionId)`; return `{ ok, savedAt }`.

## Files

- `convex/attempts.ts`

## Acceptance criteria

- [ ] Saving after submit or past grace fails.
- [ ] A third option on a Choose TWO question is rejected.
- [ ] p95 save < 300 ms (QA-3).

## Tests

- convex-test: grace boundary, wrong question, oversize string.

## Notes

- 30 s grace is in SE-4 (accepted).
