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

- [ ] Removing a tutor ends their session immediately (next call fails).
