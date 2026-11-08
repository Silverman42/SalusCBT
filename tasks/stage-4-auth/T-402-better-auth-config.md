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

- [x] Code expires after 10 min; 6th wrong try cancels it; second request within 60 s refused.

## Notes

- 2026-11-08: Primary path (§9.1); no fallback files. `convex/auth.ts`, `convex/auth.config.ts` (from the spike), `convex/http.ts`, `convex/profiles.ts` (only `otpRequestAllowed`; T-404 adds the rest), `convex/lib/clientIp.ts`.
- **OTP gate in a `before` hook, not in `sendVerificationOTP`.** Better Auth stores a new code before it calls `sendVerificationOTP`, so a request refused there would still replace (cancel) the code already emailed. The hook on `/email-otp/send-verification-otp` runs `profiles.otpRequestAllowed` first and, when refused, returns the endpoint's own `{"success":true}`. Only `type: "sign-in"` passes. `sendVerificationOTP` then only schedules `internal.email.send.send` (scheduled, so response time doesn't depend on the provider).
- `otpRequestAllowed` spends `otpRequestIp` (30/h) and `otpRequest` (1/60 s + 5/h per email) for every request, known email or not, then needs an active profile.
- Better Auth limiter: `storage: "database"` (component `rateLimit` table), `customRules` 1/60 s per IP on the send endpoint; plugin defaults (3/60 s per IP) cover `/sign-in/email-otp`. If `x-salus-client-ip` is missing in production, Better Auth falls back to **one shared bucket** per path, so the T-403 proxy must always set it.
- **Client IP decision (LLD §18.1 finding 4):** the proxy sends `x-salus-proxy-secret: <NUXT_SERVER_SECRET>` with `x-salus-client-ip`. Salus's own per-IP limit trusts the header only when that matches `SERVER_SECRET` (constant-time compare); otherwise it uses `ctx.meta.getRequestMetadata().ip`, the real TCP peer (exists in Convex 1.49; for proxied traffic it's Netlify's address, for a direct caller it's theirs). `SERVER_SECRET` unset → header never trusted, one console error. Better Auth's own limiter can't be made to check the secret (it runs before any hook), so it stays keyed on the header: a direct caller can dodge it, but not the per-email or Salus per-IP limits. IPs are stored as HMAC keys (keyed with `BETTER_AUTH_SECRET`); Better Auth's `rateLimit` and `session.ipAddress` still hold raw IPs (PR-3 question for T-404/T-218).
- Unused emailOTP endpoints are in `disabledPaths` (404): check-verification-otp, verify-email, password reset, email change.
- `guards.getAuthUserId` now uses `authComponent.safeGetAuthUser` (session must exist and be unexpired, AU-4); a token without `sessionId` is signed out. Guard tests seed real component users and sessions (`seedAuthSession`, `seedSignedIn` in `tests/convex/lib/fixtures.ts`).
- Env vars declared in `convex/convex.config.ts` (`SITE_URL`, `BETTER_AUTH_SECRET` required; `SERVER_SECRET`, `ADMIN_EMAIL`, `EMAIL_*` optional); `email/provider.ts` no longer casts `env`. Dev deployment still needs `SERVER_SECRET` (T-403) and `ADMIN_EMAIL` (T-404).
- Tests: `tests/convex/auth/signIn.test.ts` drives the real `/api/auth/*` routes in convex-test (expiry at 10 min, 5 tries then `TOO_MANY_ATTEMPTS`, 429 on same IP, silent drop per email without cancelling the first code, 5/h, no enumeration, closed sign-up, 7-day session, IP trust). `tests/convex/lib/clientIp.test.ts` for the helper. Live check on the dev deployment: unknown email → `200 {"success":true}`, same IP again → 429, disabled path → 404.
- Not verified here (T-403, end to end): cookie on the app domain through the Nuxt proxy, `x-better-auth-forwarded-*` origin handling, the proxy actually sending the secret.
