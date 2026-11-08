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

- [ ] Each helper has unit tests.
- [ ] `shuffled` is deterministic for a given seed.
- [ ] Error codes match LLD §16.

## Tests

- Vitest for anon/rng/codes; convex-test for guards and rate limits.

## Notes

- `requireProfile` depends on the auth decision (T-003); stub `getAuthUser` until T-402.
