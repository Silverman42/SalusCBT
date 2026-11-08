# T-406 · Admin backend: tutors, removal, audit, deleting attempts

| | |
| --- | --- |
| Stage | 4 · Admin and tutor sign-in |
| Depends on | [T-404](T-404-profiles-admin-bootstrap.md) |
| Requirements | `AU-4`, `AU-5`, `AU-7`, `PR-5` |
| Design refs | LLD §5.3, §9.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Admin controls over tutors and data.

## Steps

- `admin.tutors` list.
- `admin.removeTutor`: `status = removed`, delete all their sessions via the component adapter, audit `tutor.removed`.
- `admin.restoreTutor`: back to active, audit.
- `admin.audit({ cursor })`: paginated by `at` desc.
- `admin.deleteAttempts({ attemptIds })`: any attempt, cascade responses + share links, audit.

## Files

- `convex/admin.ts`

## Acceptance criteria

- [x] Removing a tutor ends their session immediately (next call fails).

## Notes

- **Functions** (`convex/admin.ts`, all admin-only via `requireProfile(ctx, ["admin"])`: signed out → `UNAUTHENTICATED`, tutor or removed admin → `FORBIDDEN`):
  - `tutors` query `{}` → `{ profileId, email, name | null, status, createdAt }[]`, newest first, active and removed, bounded at `MAX_TUTORS` (500). No role index, so a bounded filtered scan as in `ensureAdmin`; a `by_role` index is the clean fix if the table grows.
  - `removeTutor` mutation `{ profileId }` → `null`: `status = removed`, `endSessions(ctx, authUserId)` in the same mutation, audit `tutor.removed` (target = email). Idempotent: on a removed tutor it ends any sessions again but writes no audit.
  - `restoreTutor` mutation `{ profileId }` → `null`: back to `active`, audit `tutor.restored`. `VALIDATION_FAILED` if another active profile now has the same email (re-invited), so an email never has two active profiles. Idempotent for an active tutor.
  - Both refuse the admin profile (including the caller themselves) with `FORBIDDEN`, and a missing profile with `NOT_FOUND`.
  - `audit` query `{ paginationOpts }` → paginated `{ id, at, action, actorEmail | null, target | null, meta | null }`, `by_at` desc. Takes standard `paginationOpts` (not a bare `cursor`) so T-408 can use `usePaginatedQuery`. `ipHash` is never returned.
  - `deleteAttempts` mutation `{ attemptIds }` (max 100, else `VALIDATION_FAILED`) → `{ deleted }`. Any attempt, class or not (PR-5). Missing ids are skipped, duplicates count once; one `attempt.deleted` audit with `meta.count` when anything was deleted.
- **Shared cascade for T-503.** `convex/lib/attemptDeletion.ts` exports `deleteAttempts(ctx, attemptIds) → number` and `MAX_DELETE_ATTEMPTS`; `classes.deleteAttempts` should do its owner checks, call it, and write its own audit. In the one mutation it deletes the attempts and their share links (so `shareLinks.view` returns `null` at once) and cancels a still-pending `autoSubmit` job. Responses are deleted up to `RESPONSE_BATCH` (1000) per transaction; the rest by the internal mutation `lib/attemptDeletion:purgeResponses`, which reschedules itself until done (Convex guidelines: batch large deletes). Leftover responses are unreachable meanwhile, since every reader loads the attempt first.
- **No schema changes.**
- Tests: `tests/convex/admin/admin.test.ts` (12): access for every function, tutor list, removal ends sessions (`profiles.me` → `null` with the old token) and audits once, admin can't be removed/restored, restore and the re-invite conflict, audit paging order/actor email/no `ipHash`, cascade (responses, share links, cancelled job, audit count, idempotent), scheduled batch purge, the 100-id limit.
