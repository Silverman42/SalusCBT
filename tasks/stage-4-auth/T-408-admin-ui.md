# T-408 · Admin area UI

| | |
| --- | --- |
| Stage | 4 · Admin and tutor sign-in |
| Depends on | [T-406](T-406-admin-backend.md), [T-407](T-407-sign-in-invite-pages.md) |
| Requirements | `AU-5`, `AU-7` |
| Design refs | LLD §14.1 (`/admin/*`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Screens for tutors, invitations and the audit log.

## Steps

- `/admin/tutors`: list, remove (with confirm), restore.
- `/admin/invitations`: invite form, pending list with resend/cancel.
- `/admin/audit`: paginated table.
- `/admin/exam`: default exam versions (read-only until Stage 6).

## Files

- `app/pages/admin/*.vue`
- `app/components/admin/*`

## Acceptance criteria

- [ ] Non-admins are redirected; server also refuses.
