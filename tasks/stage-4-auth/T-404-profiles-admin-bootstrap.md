# T-404 · Profiles, admin bootstrap and session hooks

| | |
| --- | --- |
| Stage | 4 · Admin and tutor sign-in |
| Depends on | [T-402](T-402-better-auth-config.md) |
| Requirements | `AU-4`, `AU-6`, `AU-7` |
| Design refs | LLD §9.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Tie Better Auth users to Salus roles and audit sign-in events.

## Steps

- Internal `profiles.ensureAdmin`: create the auth user + `admin` profile from `ADMIN_EMAIL` if missing; refuse a second admin; run on deploy.
- Internal `profiles.otpRequestAllowed({ email })`: active profile + 5/hour limit.
- `session.create.before` hook rejects users without an active profile; audit `auth.signin`.
- `after` hook on verify writes `auth.otp_failed`; also log `auth.otp_requested`, `auth.signout`.

## Files

- `convex/profiles.ts`
- `convex/auth.ts`

## Acceptance criteria

- [ ] Admin exists after first deploy.
- [ ] A removed user cannot create a session.
