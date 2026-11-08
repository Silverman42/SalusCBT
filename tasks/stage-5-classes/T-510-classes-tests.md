# T-510 · Class isolation and dashboard latency tests

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-505](T-505-tutor-ui-classes.md), [T-504](T-504-share-links.md) |
| Requirements | `SE-2`, `SE-3`, `CL-5` |
| Design refs | LLD §17 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Stage 5 gate.

## Steps

- convex-test: tutor A cannot read/update/delete tutor B's classes or attempts; admin can.
- Playwright: tutor dashboard open, student submits, row appears within 5 s.
- Share link create/revoke flow.

## Files

- `tests/convex/classes/isolation.test.ts` (isolation matrix)
- `tests/convex/classes/latency.test.ts` (same-commit visibility, read limits)
- `tests/e2e/classes.spec.ts` (browser timing; skipped unless `E2E_CLASSES=1`)
- `tests/convex/lib/fixtures.ts` (`setup({ transactionLimits })`)

## Acceptance criteria

- [ ] **Stage 5 gate:** dashboard update < 5 s; tutors isolated.
  - [x] Tutors isolated: tutor B gets `NOT_FOUND` (or none of A's rows) from every tutor-facing function on A's classes, attempts and versions, and nothing is written; A and the admin succeed (convex-test).
  - [ ] Dashboard update < 5 s in a browser: the backend half is verified (a submit or timer auto-submit is visible, marked, in the very next `classes.attempts` / `stats` read; `stats` on a 1,000-attempt class stays inside Convex's read limits). The Playwright spec is written but has not been run against a live deployment.

## Notes

- **Isolation matrix** (`isolation.test.ts`): one row per tutor-facing public function in `classes`, `editor` and `content` (all but the public `classes.lookupCode`), plus extra rows for moving B's class onto A's version, a mixed `deleteAttempts` list, `getDraft` on a published version and `oralQuestions` on a draft. Each row runs in a fresh world three times: as tutor B (refused with `NOT_FOUND`, or A's records absent from `mine` / `myVersions`, and a snapshot of every table is unchanged), as A, and as the admin. A coverage check fails if a function is added to those modules without a row. The admin is refused `VALIDATION_FAILED` on edits to a tutor's draft (`saveQuestion`, `deleteQuestion`, `reorder`, `generate`, `publish`): that is ED-5 by design, not a leak. Also checked: A can't read B's class (both ways); `lookupCode` returns only name and open; a share link of A's student contains no class id, code, name, display name, tutor id or email, version id or label, and gives B no way into the dashboard.
- **Latency** (`latency.test.ts`): `attempts.submit` marks inside its own commit and cancels the timer job, leaving no pending scheduled work, so the next `classes.attempts`, `classes.stats` and `classes.attemptResult` reads show the score (900) at once. The timer's auto-submit likewise shows marked as soon as its job commits. With a reactive query this is the whole server side of CL-5.
- **Read limits**, measured with convex-test's transaction metrics (limits enforced at the older, stricter 16,384 documents / 8 MiB; current Convex limits are 32,000 / 16 MiB) on a class at `CLASS_ATTEMPTS_LIMIT` (1,000 submitted attempts, the newest `MOST_MISSED_SAMPLE` = 150 with full 90-response papers): `classes.stats` reads 14,596 documents / 3.8 MiB (89% of the old document limit, 46% of the current one); `classes.attempts` and `exportCsv` 1,004 documents / 0.8 MiB. A second test proves the limits are really enforced (a 500-document limit makes `stats` fail). Raising `MOST_MISSED_SAMPLE` much above 150 would need a look at this headroom.
- **Browser run still needed** (`tests/e2e/classes.spec.ts`): the tutor signs in by code, creates a class from `/tutor`, keeps the class page open; a second browser context calls `POST /api/attempts/start` with the code (the start form is T-211/T-508) and then `attempts.submit` through the Convex client; the row must show "Below 750" within 5 s of the submit returning. Needs `ADMIN_EMAIL`, `SERVER_SECRET` (and `NUXT_SERVER_SECRET`, `NUXT_IP_PEPPER` in `.env.local`), a seeded default version and an active tutor; run with `E2E_CLASSES=1 E2E_TUTOR_EMAIL=<tutor> npm run test:e2e -- classes.spec.ts`. Each run leaves one "E2E <timestamp>" class behind.
- **Share link create/revoke flow**: covered at the backend by `tests/convex/shareLinks/shareLinks.test.ts` (T-504) plus the class-leak check above; no browser test for the `/r/[publicId]` page was added here.
- No backend bugs found; no code outside `tests/` changed.
