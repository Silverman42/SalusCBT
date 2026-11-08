# T-219 · Privacy page and IP-hash purge cron

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-207](T-207-attempts-submit.md) |
| Requirements | `PR-1`, `PR-3`, `PR-4`, `QA-5` |
| Design refs | LLD §12.3 (purgeIpHashes); LLD §14.1 (`/privacy`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Explain what's stored, and delete IP hashes after 30 days.

## Steps

- `/privacy` (SSR): what's in the browser (token, cache, preferences) and on the server (attempts, hashed IP for 30 days, tutor emails only for sign-in).
- Footer disclaimer: Security+ style practice exam, not official or endorsed by CompTIA.
- Cron `purgeIpHashes` daily 02:30 UTC clears `ipHash` on attempts and audit rows older than 30 days.

## Files

- `app/pages/privacy.vue`
- `convex/crons.ts`

## Acceptance criteria

- [ ] Cron test shows 31-day-old hashes cleared, 29-day-old kept.
