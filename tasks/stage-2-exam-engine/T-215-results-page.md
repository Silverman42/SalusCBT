# T-215 · Results page

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-208](T-208-review-queries.md) |
| Requirements | `EX-14`, `EX-15`, `EX-16` |
| Design refs | LLD §14.1 (`/result`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Instant result with domain breakdown after submit.

## Steps

- `ResultSummary`: scaled score, Pass / Below 750, "comfortable margin" ≥ 800, points, time used, flagged count.
- `DomainChart`: points and % per domain; highlight < 81%.
- Notice that history lives in this browser, with a link to export (risk mitigation).
- Share-link button placeholder (wired in T-504).

## Files

- `app/pages/exam/[attemptId]/result.vue`
- `app/components/review/ResultSummary.vue`
- `app/components/review/DomainChart.vue`

## Acceptance criteria

- [ ] Shown immediately after submit; no manual marking. (The page reads the result the submit mutation stored, via `review.getResult`, on its first query; the runner already navigates here after submit. Not yet checked with a real sitting: there is no start flow to create an attempt until `/api/attempts/start` lands. T-220 covers it end to end.)

## Tests

- `tests/unit/attemptPages.test.ts`: error code reading (ConvexError codes; a malformed attempt id's `ArgumentValidationError` counts as `NOT_FOUND`), code and status → page state (`in_progress` → "Return to exam"), routes and mode labels.

## Notes

- Route `/exam/[attemptId]/result` (client only through the existing `/exam/**` route rule). Default layout.
- Reuses T-504's `ResultSummary` (score banner, domain breakdown with weak domains under 81 %, time used, flagged) instead of new `review/ResultSummary` and `review/DomainChart` components: the breakdown *is* the domain chart of mockup 06. `#actions` holds "Review answers", the share panel (`ResultShareLinkPanel`, T-504) and the "Attempt history" card (`HistoryRecent`, T-217) with the "history lives in this browser only, export it" notice.
- Loading and failures: `app/composables/useStudentResult.ts` (shared with T-216) and `app/components/result/ResultLoadState.vue`. On `NOT_FOUND` the page asks `attempts.getState`: in progress → "This exam isn't finished yet" with **Return to exam**; expired → "ended without a result"; otherwise (missing, foreign, malformed id) → not found with links to history and home. `BAD_TOKEN` and network errors have their own text (network has Try again).
- Retake seam (PB-4): `RETAKE_START_PATH` in `app/lib/attemptPages.ts` is `null`, so "Retake with PBQ set B" stays hidden until the start flow takes a mode (T-307).
- Live check (Nuxt dev, port 4000, 375 px and desktop, light and dark): `/exam/bogus/result` shows the not-found state; populated layout checked on a temporary fixture page (deleted).
