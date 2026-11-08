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

- [ ] A link works once and not after 7 days.
- [ ] Only the token hash is stored.

## Tests

- convex-test: expiry, reuse, cancel, resend invalidates old token.
