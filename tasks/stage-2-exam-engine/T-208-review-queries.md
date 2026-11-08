# T-208 · review.getResult, review.getReview, review.myAttempts

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-207](T-207-attempts-submit.md) |
| Requirements | `EX-16`, `EX-17`, `EX-19` |
| Design refs | LLD §5.1, §8.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Return results and full review only after submission.

## Steps

- `getResult`: owner token, submitted only.
- `getReview`: `ReviewItem[]` with options in the same shuffled order, your answer, correct answer, earned/max, parts, explanation, practice model answer (PB-2).
- `myAttempts`: list by `anonKey` with date, scaled, pass/fail.

## Files

- `convex/review.ts`

## Acceptance criteria

- [ ] In-progress attempts return `NOT_FOUND` / no keys.
- [ ] Review order matches the paper order.
