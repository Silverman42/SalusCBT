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

- [x] Cron test shows 31-day-old hashes cleared, 29-day-old kept.

## Notes

- Done 2026-11-08. Purge lives in `convex/privacy.ts` (all internal). `purgeIpHashes` (cron `30 2 * * *`) fans out one job per store; each job reads `PURGE_BATCH` (200) rows and reschedules itself with the pagination cursor until done. Retention `IP_HASH_RETENTION_MS` = 30 days; a row is purged when its time is strictly before `now − 30 days`.
- Stores purged: `attempts.ipHash` (by `startedAt`) and `auditLog.ipHash` (by `at`), field removed and nothing else touched; `@convex-dev/rate-limiter` buckets created before the cutoff (component `lib.clearAll({ before })`; keys are ipHash, anonKey, emails, profile ids; every window is ≤ 1 day, so a dropped bucket just starts full); Better Auth `rateLimit` rows (raw IP + path) with `lastRequest` before the cutoff are deleted, and `session.ipAddress` (raw IP at sign-in) is nulled on sessions created before the cutoff. Both Better Auth purges use the component's public adapter API (`deleteMany` / `updateMany`), not its tables.
- Schema: added `by_ipHash` on `attempts` and `auditLog` (additive). It holds only rows that still have a hash, so a daily run reads about 30 days of rows rather than all history (attempts are kept forever, PR-5).
- Better Auth still receives raw client IPs (needed for its per-IP OTP limit, AU-3). `advanced.ipAddress.disableIpTracking` would turn off that limit, so it isn't used. Raw IPs now live at most 30 days. Not stripped at write time: `databaseHooks.session.create.before` could return `{ data: { ...session, ipAddress: null } }` to never store it on sessions (open question; `convex/auth.ts` is outside this task).
- `/privacy` (SSR, `app/pages/privacy.vue`): browser (anonymous ID, in-progress cache, theme), server (attempts, share links, hashed IP 30 days), export/import and the "file is a secret" warning (EX-20), deletion via tutor or admin (CL-11, PR-5), staff data, what isn't collected. The CompTIA disclaimer was already in the layout footer. The export/import buttons themselves arrive with T-217 (history page).
- Tests: `tests/convex/privacy/purge.test.ts` (cron schedule, 31 vs 29 days on attempts and audit rows, other fields unchanged, paging + rescheduling over 410 interleaved rows, rate-limiter buckets, Better Auth rateLimit and session IPs).
