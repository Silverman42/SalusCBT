# T-506 · Tutor attempt review page

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-502](T-502-class-dashboard-queries.md), [T-309](../stage-3-pbqs/T-309-pbq-review-and-e2e.md) |
| Requirements | `CL-7` |
| Design refs | LLD §14.1 (`/tutor/attempts/[id]`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Tutors see exactly what the student sees in review.

## Steps

- Reuse the student review components with data from `classes.attemptReview`.

## Files

- `app/pages/tutor/attempts/[id].vue`

## Acceptance criteria

- [x] Every MCQ and PBQ answer the student gave is visible.

## Notes

- `/tutor/attempts/[id]` (staff layout, `middleware: "tutor"`) subscribes to
  `classes.attemptResult` and `classes.attemptReview` with `useStaffQuery`. Layout after mockup
  screens 09 (tutor area), 06 (result) and 07 (review): back link to the class, a header card with
  the student's display name, a class pill linking to `/tutor/classes/[classId]`, "exam · mode ·
  Submitted 5 min ago" (plus "time ran out" for timer submits) and **Delete attempt**; then the
  shared `ResultSummary` (score banner, domain breakdown, time used, flagged count) and
  `ResultReviewList` with All / Wrong / Flagged and the domain select (kept in `?filter=&domain=`
  as on the student review page). PBQs render through T-309's `PbqReview` / `PbqMark`, so every
  MCQ and PBQ answer is shown exactly as the student sees it.
- Delete uses `AdminConfirmDialog` and `classes.deleteAttempts({ attemptIds: [id] })`, then
  replaces the route with the class page. The page keeps its last data while deleting so the
  `NOT_FOUND` that follows doesn't flash "not found".
- `NOT_FOUND` (another tutor's class, in-progress or classless attempt, deleted) and a malformed
  id in the URL (Convex argument validation) both show "Attempt not found"; session errors go to
  sign-in (`useStaffQuery`); anything else shows a generic error.
- `ResultSummary` lays out by viewport width; next to the 248px staff sidebar its banner was
  squeezed under the 340px illustration from 1024px to ~1350px. The page wraps it in a size
  container and, with scoped CSS, stacks it to one column under 1100px of content width and hides
  the illustration under 720px. A container-query option on `ResultSummary` itself would be
  cleaner.
- Pure helpers in `app/lib/tutorAttempt.ts` (back link, heading, meta line, tab title, load
  state), tested in `tests/unit/tutorAttempt.test.ts`.
- Live check (Nuxt dev, port 4800): signed out, `/tutor/attempts/…` redirects to
  `/sign-in?redirect=…`; a temporary fixture page (deleted) with the real header, summary and
  three seed PBQs plus MCQs rendered correctly at 1024px dark and 375px light with no horizontal
  scroll.
