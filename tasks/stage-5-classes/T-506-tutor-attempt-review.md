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

- [ ] Every MCQ and PBQ answer the student gave is visible.
