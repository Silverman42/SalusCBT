# T-203 · Nuxt server route /api/attempts/start

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-110](../stage-1-setup/T-110-netlify-setup.md) |
| Requirements | `SE-5`, `PR-3` |
| Design refs | LLD §7.1 (last paragraph); HLD §5.1, §7.1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Adds a hashed client IP and the server secret before calling Convex, so rate limits work per IP without storing raw IPs.

## Steps

- `server/utils/ip.ts`: read `x-nf-client-connection-ip`, fall back to first `x-forwarded-for`; `HMAC-SHA256(IP_PEPPER, ip)`.
- `server/api/attempts/start.post.ts`: validate body `{ anonToken, displayName?, classCode?, mode }`, call `attempts.start` via `ConvexHttpClient` with `serverSecret` and `ipHash`.
- Map Convex errors (`RATE_LIMITED`, `CLASS_CLOSED`, `CLASS_UNKNOWN`, `BAD_TOKEN`) to HTTP status + code.

## Files

- `server/api/attempts/start.post.ts`
- `server/utils/ip.ts`

## Acceptance criteria

- [x] Raw IP never leaves the Nuxt function.
- [x] Returns `{ attemptId, deadline, serverNow }`.

## Notes

- Done 2026-11-08. Route `server/api/attempts/start.post.ts`; pure helpers in `server/utils/attemptStart.ts` (body validation, origin check, `computeIpHash`, error mapping). IP resolution reuses `resolveClientIp` from `server/utils/ip.ts` (T-403): `x-nf-client-connection-ip`, then `x-forwarded-for` in `nuxt dev` only, then the socket address. Tests: `tests/unit/server/attemptStart.test.ts`.
- Request: `POST`, `Content-Type: application/json`, body ≤ 4 KB, `{ anonToken, displayName?, classCode?, mode? }`. Unknown keys are refused (so `serverSecret`/`ipHash` can't be smuggled in). Token must match `^[A-Za-z0-9_-]{43}$`. `displayName` / `classCode` are trimmed and dropped when blank. `mode` defaults to `"standard"`.
- Responses (all `Cache-Control: no-store`): 200 `{ attemptId, deadline, serverNow }`; 400 `{ code }` with `BAD_REQUEST` (shape/JSON), `BAD_TOKEN`, `VALIDATION_FAILED` (name over 40), `CLASS_UNKNOWN`, `CLASS_CLOSED`; 403 `{ code: "CROSS_ORIGIN" }`; 404 `{ code: "NOT_FOUND" }` (no published default version); 413 `PAYLOAD_TOO_LARGE`; 415 `UNSUPPORTED_MEDIA_TYPE`; 429 `{ code: "RATE_LIMITED", retryAfter }` (ms) with `Retry-After` in seconds (≥ 1); 500 `{ code: "SERVER_ERROR" }` for missing env vars, `FORBIDDEN` (our secret is wrong), Convex's plain error when `SERVER_SECRET` is unset there, and network failures. The cause of a 500 is logged server-side only; the token, secret and raw IP are never logged or returned.
- Same-origin: refused if `Sec-Fetch-Site` is present and not `same-origin`, or `Origin` is present and not this site's origin (`getRequestURL(event).origin`). Requests with neither header (not a browser) pass; they are rate-limited like anyone else.
- `ipHash = HMAC-SHA256(NUXT_IP_PEPPER, ip)`, hex (64 chars). No resolvable IP → hashes `"unknown"` (one shared bucket) and logs a warning.
- Env (LLD §15.2): `NUXT_PUBLIC_CONVEX_URL`, `NUXT_SERVER_SECRET` (same value as `SERVER_SECRET` on Convex), and new `NUXT_IP_PEPPER` (`runtimeConfig.ipPepper`, in `.env.example`). All three must be set on Netlify (T-110). Changing the pepper resets per-IP buckets.
- Live check (nuxt dev, port 4200): malformed JSON → 400 `BAD_REQUEST`; short token → 400 `BAD_TOKEN`; `text/plain` → 415; `Origin: https://evil.example` or `Sec-Fetch-Site: cross-site` → 403; valid body → 500 `SERVER_ERROR` with the log line "NUXT_SERVER_SECRET is not set" (not set locally). With a throwaway local secret and pepper, the route called the dev deployment and got Convex's plain "Server Error" (its `SERVER_SECRET` is unset) → 500 as documented. The success path needs `SERVER_SECRET` set on Convex.
