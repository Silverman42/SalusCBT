# T-402 · Better Auth configuration in Convex

| | |
| --- | --- |
| Stage | 4 · Admin and tutor sign-in |
| Depends on | [T-003](../stage-0-decisions/T-003-auth-spike.md), [T-104](../stage-1-setup/T-104-convex-schema.md), [T-401](T-401-email-provider.md) |
| Requirements | `AU-1`, `AU-2`, `AU-3`, `AU-4` |
| Design refs | LLD §9.1 (or §9.4 if fallback) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Configure passwordless sign-in with the agreed limits.

## Steps

- `convex/auth.ts` per §9.1: 7-day sessions, email+password off, `emailOTP` (6 digits, 600 s, 5 attempts, `disableSignUp`).
- `sendVerificationOTP` only for `sign-in`, checks `profiles.otpRequestAllowed` (5/hour, active profile) and stays silent otherwise.
- Better Auth `customRules` for 1 request / 60 s; `ipAddressHeaders: ['x-salus-client-ip']`.
- `convex/http.ts` registers the auth routes.
- If fallback: implement `otpCodes`, `sessions`, HMAC code hashes, JWT exchange route and `auth.config.ts` per §9.4.

## Files

- `convex/auth.ts`
- `convex/http.ts`
- `convex/auth.config.ts (fallback)`

## Acceptance criteria

- [ ] Code expires after 10 min; 6th wrong try cancels it; second request within 60 s refused.
