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

- [x] In-progress attempts return `NOT_FOUND` / no keys.
- [x] Review order matches the paper order.

## Notes

- Done 2026-11-08. `convex/review.ts` (the three queries) and `convex/lib/review.ts` (builders `buildResult`, `buildReview`, `attemptSummary`, `requireSubmitted` and their validators, for reuse by `shareLinks.view` in T-504: authorise first, then call the builder). Tests: `tests/convex/review/review.test.ts` (12 cases, real seed).
- `getResult({ attemptId, anonToken })` → `{ attemptId, mode, examTitle, startedAt, submittedAt, submittedBy, passScaled, comfortScaled, domainTarget, result }`; `result` is the stored `attemptResultValidator` summary (the same object `attempts.submit` returns). The thresholds let T-215 show Pass / comfortable margin / domains below 81% without hard-coding them. Never reads `answerKeys`.
- `getReview({ attemptId, anonToken })` → `ReviewItem[]` in paper order (PBQ set for the mode, set B for a retake, then MCQs). Each item is the paper question exactly as `getPaper` showed it (built with `toPaperQuestion`, so MCQ options and PBQ MCQ-part options are in the same seeded order) plus `domain`, `flagged`, `yourAnswer` (`AnswerValue | null`), `correctAnswer` (the key as an `AnswerValue`: `mcq` option ids, `pbq` part answers or `firewall` rules; `null` if the key is missing), `earned`, `max` (= `q.points`), `explanation` (`""` if the key is missing). PBQ items add `partResults: boolean[]` (per scored part / rule, payload order) and `practiceAnswer?: Record<partId, string>` (PB-2, e.g. 1d).
- Deviations from the LLD §8.3 sketch: options keep the paper's field name `options` (not `optionsInDisplayOrder`) so the runner's question components can render review items; per-part marks are `partResults` (as in `responses`), not `parts`, to avoid confusion with `payload.parts` and key `parts`; `flagged` is added for the T-216 filter.
- Marks come from the rows `finalise` wrote. A question with no response row shows `earned: 0`, `yourAnswer: null` and, for a PBQ, all-false `partResults` (computed by scoring an empty answer, so the length matches the scored parts).
- `myAttempts({ anonToken, paginationOpts })` → a Convex pagination result of `{ attemptId, mode, status, startedAt, deadline, submittedAt?, scaled?, passed?, points?, totalPoints? }`, newest first (`by_anonKey` desc). In-progress attempts are listed (no scores) so T-217 can link to resume. `numItems` outside 1–100 → `VALIDATION_FAILED`; the options are otherwise passed to `.paginate()` unchanged.
- Errors: `BAD_TOKEN`; `NOT_FOUND` for a missing, foreign, in-progress or expired attempt (one code, as SE-3 asks; §16 has no "still open" code). The client knows the status from `attempts.getState`.
- T-209: `getResult` / `getReview` throw for an in-progress attempt; `myAttempts` never carries keys. Note that review items legitimately contain the key names `correctAnswer`, `explanation` and `practiceAnswer` after submission, so the leak test should only scan in-progress calls (or the share view of a revoked link).
