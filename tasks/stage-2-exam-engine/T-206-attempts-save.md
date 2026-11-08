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

- [x] Saving after submit or past grace fails.
- [x] A third option on a Choose TWO question is rejected.
- [ ] p95 save < 300 ms (QA-3). Not measured yet (needs the deployed runner, T-212/T-220); the save is 3 reads (attempt, question, response row) and 1 write.

## Tests

- convex-test: grace boundary, wrong question, oversize string.

## Notes

- 30 s grace is in SE-4 (accepted). `SAVE_GRACE_MS` (= `AUTO_SUBMIT_GRACE_MS`) in `convex/attempts.ts`; `now === deadline + 30 000` is still accepted.
- Signature: `saveResponse({ attemptId, anonToken, questionId, value?, flagged, clientUpdatedAt? })` → `{ ok: true, savedAt, applied }`. `savedAt` is the server time of the call; `applied: false` means the save was older than the stored row and was dropped (the client can drop it from its queue too). `clientUpdatedAt` and `applied` are additions to the LLD §4 signature.
- Each call sends the question's whole state: omit `value` (or send a blank one) to clear the answer; a flag toggle resends the current value.
- Ordering (LLD silent): last write wins by `clientUpdatedAt`, the change time in server-clock ms (`Date.now() + clockOffset`, T-212), clamped to `[startedAt, now]` and stored as `responses.updatedAt`. Without it, arrival order. Ties apply, so an identical retry is idempotent. No schema change was needed.
- D9: a blank, unflagged save creates no row; an existing row is kept when cleared (value removed) so the ordering check still works. Marking (T-207) must treat a row with no `value` as unanswered.
- Value checks live in `convex/lib/answers.ts` (`answerFitsQuestion`, `isBlankAnswer`), questions only, never `answerKeys`. Blank values (`[]`, all-`""` parts, all-null firewall cells) are stored as no value. PBQ parts may be `""`; portPair takes up to two strings; practice parts (1d) are accepted.
- Errors: `BAD_TOKEN`; `NOT_FOUND` (attempt missing/foreign, or question not on this paper: other version or other PBQ set); `ATTEMPT_CLOSED`; `VALIDATION_FAILED` (value doesn't fit, or non-finite `clientUpdatedAt`). Wrong-typed values fail the Convex arg validator (plain arg error).
- No save rate limit: LLD §12.1 has none. Size caps and the per-question shape check bound each write.
- Tests: `tests/convex/attempts/save.test.ts` (41 cases).
