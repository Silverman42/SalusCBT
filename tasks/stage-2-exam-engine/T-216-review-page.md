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

- [ ] Filters combine correctly.
- [ ] Explanation ("Why") shown for every question.
