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

- [x] Admin exists after first deploy (once `ADMIN_EMAIL` is set and `profiles:ensureAdmin` runs as a post-deploy step; see Notes).
- [x] A removed user cannot create a session.

## Notes

- **Bootstrap.** `profiles.ensureAdmin` (internal mutation, `{}` → `{ status: "created" | "exists", email }`) is idempotent. Convex has no post-deploy hook, so "run on deploy" means running `npx convex run profiles:ensureAdmin` after `convex deploy` (in Netlify: append `&& npx convex run profiles:ensureAdmin` to the build command in T-110, or run it once by hand; `CONVEX_DEPLOY_KEY` picks the deployment, or add `--prod`). It throws a `ConvexError` with a clear message when `ADMIN_EMAIL` is unset or invalid, when another email already holds the admin profile (AU-6), or when the email has an active tutor profile. An existing Better Auth user for the email is reused. Preview deployments have no `ADMIN_EMAIL`, so don't run it there (or expect the refusal). Verified on dev: refuses with "ADMIN_EMAIL is not set …" (dev has no `ADMIN_EMAIL`).
- **No role index.** `ensureAdmin` finds the admin with a filtered scan of `profiles` (`.take(10)`); fine at this size. A `by_role` index would be the clean fix if the table grows.
- **Session gate.** `databaseHooks.session.create.before` calls `profiles.sessionAllowed` and throws `APIError("FORBIDDEN", { code: "ACCOUNT_INACTIVE" })` (returning `false` would make the OTP endpoint crash on a null session). Covers a tutor removed after their code was sent.
- **Audit (§12.2).** `auth.otp_requested` in `otpRequestAllowed` (only when a code is actually sent, no actor), `auth.signin` from `session.create.after` (actor = profile), `auth.otp_failed` from an `after` hook on `/sign-in/email-otp` with `meta.reason` = Better Auth's error code (`INVALID_OTP`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`, `ACCOUNT_INACTIVE`; no actor), `auth.signout` from a `before` hook on `/sign-out` (reads the cookie's session; actor = profile). Events for emails/users without a profile are dropped so strangers can't fill the log. `ipHash` is the same HMAC key the OTP limits use (`ipRateLimitKey` with `BETTER_AUTH_SECRET`), set when Convex reports a client IP.
- **Removal (AU-4).** `endSessions(ctx, authUserId)` (exported helper in `profiles.ts`) deletes all of a user's sessions via `internalAdapter.deleteUserSessions`; `admin.removeTutor` (T-406) should call it after setting `status = "removed"`. Tested: the Convex token stops working at once (`me` → null, `requireProfile` → `UNAUTHENTICATED`).
- **`profiles.me`** (public query) returns `{ role, name, email, status }` or `null`. The T-403 seam is wired: `useAuth().fetchRole()` fetches a Convex token and queries `me` with a one-off `ConvexHttpClient` (the shared `$convex` client may not be authenticated yet when the route guard runs), mapped by `roleFromProfile` in `app/lib/authGuard.ts` (non-active → `null`).
- Tests: `tests/convex/auth/profiles.test.ts` (14), `roleFromProfile` in `tests/unit/authGuard.test.ts`.
