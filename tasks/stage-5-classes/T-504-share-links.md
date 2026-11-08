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

- [ ] Revoked link stops working within the cache window.
- [ ] Leak test (T-209) covers `shareLinks.view`.
