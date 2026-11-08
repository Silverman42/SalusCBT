# T-216 · Review page with filters

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-208](T-208-review-queries.md) |
| Requirements | `EX-17`, `EX-18`, `PB-2` |
| Design refs | LLD §8.3, §14.1 (`/review`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Per-question review with the student's answer, correct answer and explanation.

## Steps

- `ReviewItem` component for MCQ (PBQ variants come in Stage 3).
- Filters: wrong, flagged, by domain.
- Same option order as during the exam.

## Files

- `app/pages/exam/[attemptId]/review.vue`
- `app/components/review/ReviewItem.vue`

## Acceptance criteria

- [x] Filters combine correctly. (`queryReview`: status filter (All / Wrong / Flagged) AND domain; pill counts follow the chosen domain. Unit tests, plus a fixture check: Wrong + 2.0 left only the wrong 2.0 question.)
- [x] Explanation ("Why") shown for every question. (`ResultReviewItem` shows the "Why" panel for every item whose `explanation` is non-empty; `getReview` returns the explanation for every question and is only empty when the answer key is missing.)

## Tests

- `tests/unit/resultView.test.ts` ("review filters"): status × domain combinations, domain list with counts in domain order, `?filter=` / `?domain=` parsing (unknown values, arrays and prototype keys fall back to "all").

## Notes

- Route `/exam/[attemptId]/review` (client only). Loads `getResult` (for the "Review · 814 Pass" chip) and `getReview` together through `useStudentResult(…, { withReview: true })`; the same failure states as the result page, including "Return to exam" for an unfinished attempt.
- Reuses T-504's `ResultReviewList` / `ResultReviewItem` (MCQ and PBQ variants, options in the order the student saw them, PB-2 practice parts unscored with the model answer). `ReviewList` gains an opt-in `by-domain` prop (the "All domains" select of mockup 07, a native `<select>`) and `v-model:filter` / `v-model:domain`; the share page is unchanged. Heading no longer wraps on phones.
- Filters are kept in the URL (`?filter=wrong&domain=2.0`) with `router.replace`, so a refresh keeps them.
- Deviation from mockup 07: no left-hand question list; the filtered questions are stacked (as on the share page). A polite live region announces how many questions are shown.
