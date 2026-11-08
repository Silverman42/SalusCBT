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

- [ ] Raw IP never leaves the Nuxt function.
- [ ] Returns `{ attemptId, deadline, serverNow }`.
