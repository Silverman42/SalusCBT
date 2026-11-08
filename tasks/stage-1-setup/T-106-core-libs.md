# T-106 · Core Convex libraries: anon, rng, codes, guards, audit, rate limits

| | |
| --- | --- |
| Stage | 1 · Setup |
| Depends on | [T-104](T-104-convex-schema.md) |
| Requirements | `SE-2`, `SE-3`, `SE-5`, `EX-10`, `AU-7` |
| Design refs | LLD §4, §5.4, §7.3, §12.1, §12.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Shared helpers every Convex function relies on.

## Steps

- `lib/anon.ts`: `anonKeyOf(token)` (43-char base64url check, SHA-256 hex) and `loadOwnAttempt` (same `NOT_FOUND` for missing or not-owned).
- `lib/rng.ts`: mulberry32 `rng`, Fisher–Yates `shuffled`, `fnv1a32`, `questionSeed`.
- `lib/codes.ts`: random base64url tokens, class code generator (no 0/O/1/I), constant-time compare.
- `lib/guards.ts`: `requireProfile(ctx, roles)` and `requireClassOwner` (return `NOT_FOUND` for others' records).
- `lib/audit.ts`: `writeAudit(ctx, { actorId, action, target, meta, ipHash })` with the event names from §12.2.
- `lib/rateLimits.ts`: define all limits from §12.1 with `@convex-dev/rate-limiter`; throw `RATE_LIMITED` with `retryAfter`.

## Files

- `convex/lib/anon.ts`
- `convex/lib/rng.ts`
- `convex/lib/codes.ts`
- `convex/lib/guards.ts`
- `convex/lib/audit.ts`
- `convex/lib/rateLimits.ts`

## Acceptance criteria

- [x] Each helper has unit tests.
- [x] `shuffled` is deterministic for a given seed.
- [x] Error codes match LLD §16.

## Tests

- Vitest for anon/rng/codes; convex-test for guards and rate limits.

## Notes

- `requireProfile` depends on the auth decision (T-003); stub `getAuthUser` until T-402.
- Done 2026-11-08. Tests: `tests/unit/convex-lib/{rng,codes,anon,errors}.test.ts` (Vitest, node) and `tests/convex/lib/{guards,anon,audit,rateLimits}.test.ts` (convex-test; `fixtures.ts` registers the rate limiter via `@convex-dev/rate-limiter/test`).
- Added `convex/lib/errors.ts` (not in the file list): the §16 codes as a type, `fail(code)`, `rateLimited(retryAfter)` and `errorCodeOf(err)`. Codes are thrown as the bare string (`ConvexError("NOT_FOUND")`, as in the LLD); `RATE_LIMITED` carries `{ code, retryAfter }` (ms). `errorCodeOf` reads both shapes.
- Auth seam: `guards.getAuthUserId(ctx)` reads `ctx.auth.getUserIdentity()?.subject` (the Better Auth user id). **T-402:** replace its body with `(await authComponent.safeGetAuthUser(ctx))?._id ?? null`, which also checks the session row still exists (AU-4).
- Rate limits are token buckets with capacity = rate. `otpRequest` is two buckets (`otpRequest` 1/min + `otpRequestHourly` 5/h); `enforceRateLimit(ctx, "otpRequest", email)` checks both before consuming either. `tryRateLimit` returns `false` instead of throwing, for silent OTP refusals. Limits must be called from mutations (or actions).
- `codes.ts` also holds `sha256Hex` (anon keys, invitation token hashes), `newPublicId` (22 chars), `randomUint32` (shuffle seed) and `normaliseClassCode`. Class codes are `SEC-` + 4 symbols from a 32-symbol alphabet (no bias); callers retry on a `by_code` collision.
- No new environment variables.
