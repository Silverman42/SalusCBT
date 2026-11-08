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

- [x] Non-admins are redirected; server also refuses.

## Notes

- Ticked: `middleware/admin.ts` (from T-407) is on every `/admin/*` page and was checked live: a
  signed-out visit to `/admin/tutors` lands on `/sign-in?redirect=/admin/tutors`. Every
  `admin.*` and `invitations.*` function calls `requireProfile(ctx, ["admin"])`, and the UI
  sends the user to sign-in when a call answers `UNAUTHENTICATED` or `FORBIDDEN` (e.g. a session
  ended elsewhere).
- Screens follow mockup screen 10 ("Admin"). `app/layouts/staff.vue` is the 248px sidebar from
  screens 09/10 (logo, section links, profile chip with initials, role and the
  `AuthSignOutButton` in its new `compact` icon form); on phones it becomes a top bar with a
  menu sheet. Pages opt in with `definePageMeta({ layout: "staff", title })`; the tutor links
  (screen 09) are already in `app/lib/staffNav.ts` for T-505.
- `/admin/tutors` is screen 10: "Invite a tutor" banner, "Pending invitations · N" with
  Resend/Cancel, "Tutors · N" with Active/Removed badges and Remove (confirm dialog) or Restore,
  and an "Audit log" card with the latest 6 events and "View all". `/admin/invitations` has the
  invite form and every invitation (table from md up, cards on phones). `/admin/audit` is a
  table (list on phones) paged 25 at a time with "Load more" via `continueCursor`.
  `/admin/exam` is read-only text (no versions query exists yet). `/admin/attempts` (not in
  LLD §14.1) deletes attempts by pasted id or `/exam/<id>` link, at most 100, after a confirm
  dialog (PR-5, `admin.deleteAttempts`). `/admin` redirects to `/admin/tutors`.
- Lists are live (`useStaffQuery`: `$convex.onUpdate` after `useAuth()` has connected Convex
  auth and the session has loaded). Mutations go through `useAdminAction` (busy flag, toast,
  sign-in redirect on session errors). Invite errors show inline with `aria-live`. Cancel
  invitation, remove tutor and delete attempts ask first in a Nuxt UI modal.
- Left out of the mockup: the "All classes" link and the per-tutor class count (no admin
  queries for them yet).
- Pure helpers in `app/lib/admin.ts` and `app/lib/staffNav.ts`, tested in
  `tests/unit/admin.test.ts` (24 tests): badges, effective invitation status and actions,
  expiry wording, "Today · 09:14" times by calendar day, initials, email masking, audit wording
  for every §12.2 event, attempt id parsing, error messages (invitation reasons, rate limit,
  restore conflict, session errors), sidebar area and active item.
- Not checked live as an admin: that needs `ADMIN_EMAIL` and `profiles:ensureAdmin` on the dev
  deployment. All admin pages, the layout and components compiled in the dev server (:3600)
  with no console errors.
