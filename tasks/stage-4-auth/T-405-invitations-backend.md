# T-405 · Invitations backend

| | |
| --- | --- |
| Stage | 4 · Admin and tutor sign-in |
| Depends on | [T-404](T-404-profiles-admin-bootstrap.md), [T-401](T-401-email-provider.md) |
| Requirements | `AU-5`, `AU-7` |
| Design refs | LLD §9.3, §5.3; HLD §5.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Invitation-only tutor registration.

## Steps

- `invitations.create`: admin only, lower-case + validate email, refuse if active profile exists, cancel older pending, 32-byte token, store hash, 7-day expiry, schedule invite email, audit, `invitationCreate` 50/day limit.
- `invitations.list`, `resend` (new token), `cancel`.
- `invitations.peek({ token })` → `{ email, valid }`.
- `invitations.accept({ token })` action: check hash/pending/expiry → create auth user via server API → tutor profile → mark accepted → audit.
- Daily cron `expireInvitations` at 02:00 UTC.

## Files

- `convex/invitations.ts`
- `convex/crons.ts`

## Acceptance criteria

- [x] A link works once and not after 7 days.
- [x] Only the token hash is stored.

## Tests

- convex-test: expiry, reuse, cancel, resend invalidates old token.

## Notes

- Verified in `tests/convex/auth/invitations.test.ts` (16 convex-test tests): admin-only access, email
  normalisation and validation, active-profile refusal, superseded invitations cancelled, only
  `sha256(token)` stored (the raw token is only in the scheduled email), single use, refused at
  exactly 7 days and accepted 1 ms before, resend invalidates the old token and renews the 7 days,
  cancel, the shared 50/day `invitationCreate` limit (create + resend), the expiry jobs, and an
  accepted tutor signing in by code.
- `accept` is a thin public action over `internal.invitations.redeem`: one mutation creates the
  Better Auth user (`internalAdapter.createUser(..., { method: "invitation" })`, reused if one
  exists), the tutor profile, marks the invitation accepted and audits `invite.accepted`, atomically.
- Unknown, malformed, expired, cancelled and used tokens look the same: `peek` →
  `{ email: null, valid: false }`, `accept` → `NOT_FOUND`.
- No clock reads in queries: each create/resend schedules `expireOne({ tokenHash })` at `expiresAt`
  (a resend changes the hash, so the old job does nothing); the daily `expireInvitations` cron (02:00
  UTC, `convex/crons.ts`) sweeps leftovers in batches of 200; `redeem` re-checks `expiresAt` itself.
- Refusals are `ConvexError({ code: "VALIDATION_FAILED", reason })` with `reason` one of
  `INVALID_EMAIL`, `ALREADY_ACTIVE`, `NOT_PENDING`.
- Resend also works on an `expired` invitation (it becomes pending again); cancelling a cancelled one
  is a no-op.
- Re-inviting a removed tutor reactivates their existing profile on accept (keeps `by_authUserId`
  unique and keeps their classes) rather than inserting a second profile.
- Schema: added the index `invitations.by_status_and_expiresAt` for the cron.
