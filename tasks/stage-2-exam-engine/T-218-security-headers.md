# T-218 · Security headers and CSP

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-110](../stage-1-setup/T-110-netlify-setup.md) |
| Requirements | `SE-7` |
| Design refs | LLD §15.1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Strict headers on every response.

## Steps

- Add `routeRules` headers in `nuxt.config.ts` from LLD §15.1 (CSP with the Convex URLs, HSTS, `X-Frame-Options: DENY`, nosniff, Referrer-Policy, Permissions-Policy).
- Use nonces instead of `style-src 'unsafe-inline'` if the spike showed it's possible.

## Files

- `nuxt.config.ts`

## Acceptance criteria

- [ ] Headers present on pages and server routes (check with `curl -I`).
- [ ] No CSP violations in the console during a full sitting.
