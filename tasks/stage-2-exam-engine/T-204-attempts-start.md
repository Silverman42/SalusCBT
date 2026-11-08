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

- [x] Bad secret → rejected.
- [x] 11th start in an hour → `RATE_LIMITED`.
- [x] Closed class → `CLASS_CLOSED`.
- [x] Deadline is server-computed.

## Tests

- convex-test for each case above.

## Notes

- EX-21 is accepted. Use `class.timeMultiplier`; classes default to 1 until T-509 adds the picker.
- Done 2026-11-08. `convex/attempts.ts` exports `start` (public mutation, server-only by secret) and a placeholder internal `autoSubmit` (no-op until T-207 adds `finalise`), so `start` can schedule a real job. Tests: `tests/convex/attempts/start.test.ts` (18 cases, incl. one on the real imported seed).
- Signature: `{ serverSecret, anonToken, displayName?, classCode?, mode: "standard" | "retake", ipHash }` → `{ attemptId, deadline, serverNow }`. Nothing else is returned, and `answerKeys` is never read (SE-1).
- Secret: compared with `secretsMatch` from `convex/lib/clientIp.ts` (constant time over SHA-256 digests, so length doesn't leak either). Wrong or empty secret → `FORBIDDEN`. `SERVER_SECRET` unset or empty → a plain `Error` ("SERVER_SECRET is not set…") on every call, so a misconfigured deployment fails closed and shows up as a 500, not a 403. Set `SERVER_SECRET` on each deployment (same value as `NUXT_SERVER_SECRET`) before T-203 can start attempts.
- Order: secret → token (`BAD_TOKEN`) → `attemptStartAnon` (anonKey) → `attemptStartIp` (ipHash) → class → insert. Any later error rolls the mutation back, so refused starts (bad class, missing name) spend no rate-limit tokens.
- Class code: blank or whitespace → no class. Otherwise `normaliseClassCode`; over 32 chars or no match → `CLASS_UNKNOWN`; not `open` → `CLASS_CLOSED`. With a class, `displayName` is required, 1–40 chars after trimming. Without a class it is optional (trimmed, blank dropped, over 40 rejected). §16 has no code for this, so it uses `VALIDATION_FAILED`; T-203 should map it to 400.
- Default path: exam `sy0-701` (`DEFAULT_EXAM_SLUG`) → `defaultVersionId`. Missing or unpublished version → `NOT_FOUND`. A class's version must also still be `published`.
- `deadline = now + round(timeLimitMin × 60 000 × multiplier)`. The multiplier is `class.timeMultiplier` when it is positive and finite, else 1. The 1.25× case gives 112.5 min.
- Retake (PB-4): only `mode` is stored. T-205/T-206/T-207 choose `pbqB` over `pbqA` from `attempt.mode`.
- `ipHash` is stored as given (the HMAC is computed by Nuxt with `NUXT_IP_PEPPER`, T-203). An empty value or one over 128 chars is a server-contract bug and throws a plain `Error`.
- No audit event: §12.2 has no attempt-start action.
