# T-403 · Nuxt /api/auth proxy, auth client and route guards

| | |
| --- | --- |
| Stage | 4 · Admin and tutor sign-in |
| Depends on | [T-402](T-402-better-auth-config.md) |
| Requirements | `AU-4`, `AR-2` |
| Design refs | LLD §9.1 (bullets); HLD D6 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Same-origin cookies and a typed auth client in the app.

## Steps

- `server/api/auth/[...].ts` forwards to `${CONVEX_SITE_URL}/api/auth/*`, copies cookies both ways, sets `x-salus-client-ip`.
- Cookies `Secure`, `HttpOnly`, `SameSite=Lax`.
- `useAuth` composable with `createAuthClient({ baseURL: '/api/auth', plugins: [emailOTPClient(), convexClient()] })`.
- Convex client gets its token through the plugin's token fetcher.
- `middleware/tutor.ts` and `middleware/admin.ts` redirect to `/sign-in` on `UNAUTHENTICATED`/`FORBIDDEN`.

## Files

- `server/api/auth/[...].ts`
- `app/composables/useAuth.ts`
- `app/middleware/tutor.ts`
- `app/middleware/admin.ts`

## Acceptance criteria

- [ ] Session cookie is set on the app's domain.
- [ ] Guards are UX only — server checks still apply (SE-2).
