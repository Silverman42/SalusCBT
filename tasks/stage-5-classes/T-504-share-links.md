# T-504 · Share links and the /r/[publicId] page

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-208](../stage-2-exam-engine/T-208-review-queries.md) |
| Requirements | `CL-9` |
| Design refs | LLD §5.1 (shareLinks.*), §14.1 (`/r/[publicId]`); HLD §5.5 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Students share one result with an unguessable link they can revoke.

## Steps

- `shareLinks.create`: owner token, submitted only, one active link per attempt, 128-bit `publicId`, `shareLinkCreate` 20/day.
- `shareLinks.revoke({ publicId, anonToken })`.
- `shareLinks.view({ publicId })` → result + review or `null`.
- `/r/[publicId]` SSR page, CDN cache 60 s; share/revoke buttons on the result page.

## Files

- `convex/shareLinks.ts`
- `app/pages/r/[publicId].vue`
- `app/pages/exam/[attemptId]/result.vue`

## Acceptance criteria

- [x] Revoked link stops working within the cache window.
- [x] Leak test (T-209) covers `shareLinks.view`.

## Notes

- Done 2026-11-08. `convex/shareLinks.ts`; page `app/pages/r/[publicId].vue`; components `app/components/result/` (`ResultSummary`, `ReviewList`, `ReviewItem`, `ShareLinkPanel`); pure helpers `app/lib/resultView.ts`. Tests: `tests/convex/shareLinks/shareLinks.test.ts` (12), `tests/unit/resultView.test.ts` (8), and `tests/convex/leak.test.ts` now classifies and scans the four share functions.
- `create({ attemptId, anonToken })` → `{ publicId }`: owner token, submitted only (`NOT_FOUND` otherwise, as `review.*`). Idempotent: returns the active link if there is one; only a new link spends a `shareLinkCreate` token (20/day per anonKey). After a revoke, `create` makes a new id; old ids stay dead.
- `revoke({ publicId, anonToken })` → `null`: sets `revokedAt`; again is a no-op. Unknown, malformed and another token's ids all give `NOT_FOUND`.
- `forAttempt({ attemptId, anonToken })` → `{ publicId, createdAt } | null` (not in LLD §5.1): lets the result page show Copy / Revoke after a reload without creating a link.
- `view({ publicId })` → `{ result, review } | null`. `result` is `buildResult` minus `attemptId`; `review` is `buildReview` (keys, explanations and the student's answers: PRD CL-9 says the link shows the review, and creating it is the owner's explicit choice). Every miss is `null`: malformed, unknown, revoked, attempt deleted, owner mismatch, not submitted. No anonKey, ipHash, class, display name or attempt id.
- Page: SSR via `ConvexHttpClient` in `useAsyncData`; misses get HTTP 404 and one "We couldn't find that" state (a Convex outage gets 503 and a "couldn't load" state). `routeRules["/r/**"]`: `cache-control: public, max-age=0, must-revalidate`, `netlify-cdn-cache-control: public, s-maxage=60` (no stale-while-revalidate, so a revoked link is gone within 60 s), `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer`; also `robots` and `referrer` meta tags.
- CSP (LLD §18.1 finding 5): cached `/r` HTML can't carry per-request nonces, so T-218 needs hashes (or no HTML caching) for `/r/**`.
- Not done here: the share button on `app/pages/exam/[attemptId]/result.vue` (T-213/T-215 own that page). `ShareLinkPanel` (prop `attemptId`, client only) is ready to drop into `ResultSummary`'s `#actions` slot; T-215 can reuse `ResultSummary` with the `review.getResult` result.

