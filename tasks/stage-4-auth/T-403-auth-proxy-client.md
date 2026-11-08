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

- [x] Session cookie is set on the app's domain.
- [x] Guards are UX only — server checks still apply (SE-2).

## Notes

- Proxy: `server/api/auth/[...].ts`, with the pure header and IP logic in `server/utils/authProxy.ts` and `server/utils/ip.ts` (unit tests in `tests/unit/server/`). Mirrors the Next.js handler from `@convex-dev/better-auth` (§18.1 finding 1); `Set-Cookie` passes back unchanged, so Better Auth's `HttpOnly`, `SameSite=Lax` (and `Secure` on https) cookie lands on the app's origin. Checked live: two `Set-Cookie` headers survive the proxy; the T-003 spike verified the real session cookie.
- Client IP (finding 4): `x-salus-client-ip` comes from `x-nf-client-connection-ip` (set by Netlify's edge, which overwrites any client value), else the socket address. `x-forwarded-for` is client-writable, so it is used only in `nuxt dev`. `x-salus-proxy-secret` = `NUXT_SERVER_SECRET`. All incoming `x-salus-*`, `x-better-auth-*`, `x-forwarded-*`, `x-nf-*`, `forwarded`, `x-real-ip` and similar headers are dropped before forwarding. If no valid IP is known the header is omitted (Better Auth then uses its shared bucket).
- `NUXT_SERVER_SECRET` must equal `SERVER_SECRET` on Convex. Until `SERVER_SECRET` is set there, Convex ignores the IP header for Salus's per-IP limit (fail safe) and the proxy logs a one-time warning when its own secret is missing.
- Live check (2026-11-08, dev deployment): unknown email → `200 {"success":true}`; `GET /api/auth/convex/jwks` and `/get-session` pass through; `/api/authx` → 404. Against a local echo server: forged `x-salus-client-ip`/`x-salus-proxy-secret`/`x-forwarded-host`/`x-real-ip` replaced or dropped; body, query and cookies forwarded.
- Client: `app/lib/authClient.ts` (`createAuthClient` needs an absolute URL, so `baseURL` is `${location.origin}/api/auth`), `app/composables/useAuth.ts`, `app/plugins/convex.client.ts` (`$convex`; `useAuth` calls `$connectConvexAuth()`, which re-calls `setAuth` on every session id change and `clearAuth` on sign-out, finding 2; student pages never load the auth client).
- Guards: `middleware/tutor.ts`, `middleware/admin.ts` (pages opt in with `definePageMeta({ middleware: "tutor" | "admin" })`), decisions in `app/lib/authGuard.ts`. `/tutor`, `/tutor/**`, `/admin/**`, `/sign-in` are `ssr: false` in `routeRules`, so guards run in the browser. Signed out → `/sign-in?redirect=<path>`; `safeRedirectPath` is there for T-407 to validate that parameter.
- SEAM(T-404): `useAuth().fetchRole()` returns `undefined` until `profiles.me` exists, so any signed-in user passes both guards; the role rules (tutor kept out of `/admin`, no active profile → sign-in) are implemented and tested.
