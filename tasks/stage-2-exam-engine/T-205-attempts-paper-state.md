# T-205 · attempts.getPaper and attempts.getState

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-204](T-204-attempts-start.md) |
| Requirements | `EX-6`, `EX-10`, `EX-11`, `SE-1`, `SE-3` |
| Design refs | LLD §7.3, §5.1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Give the student their paper with no answer data, and the saved state for refreshes.

## Steps

- `getPaper`: `loadOwnAttempt`; read `questions` only (never `answerKeys`); PBQs first, then MCQs by number; shuffle options with `questionSeed(attempt.shuffleSeed, q._id)`; keep original option ids; shuffle PBQ MCQ parts too.
- `getState`: `{ status, deadline, serverNow, responses[] }` (value + flagged only, no `earned`/`partResults` before submit).

## Files

- `convex/attempts.ts`

## Acceptance criteria

- [x] Same attempt always returns the same option order.
- [x] Other tokens get `NOT_FOUND`.
- [x] No key or explanation fields in the response.

## Notes

- Implemented 2026-11-08. `convex/attempts.ts` (`getPaper`, `getState`) and `convex/lib/paper.ts` (paper building, shared with T-206/T-207/T-208). Tests: `tests/convex/attempts/paper.test.ts` (real seed).
- `getPaper({ attemptId, anonToken })` → `{ attemptId, mode, questions[] }`. Each question is `{ questionId, kind: "mcq", section, displayNumber, points, stem, chooseCount, options }` or `{ questionId, kind: "pbq", section, displayNumber, points, stem, payload }`. Fields are copied one by one (payloads per template), so a new column is not sent until it is listed. `domain`, `order`, `versionId` and system fields are left out (not needed to sit the exam).
- Sections: `loadPaperQuestions` returns the PBQ set for the mode (`pbqA`, or `pbqB` for a retake) then `mcq`, each by `order`. T-206 should use it (or `sectionsFor`) to check a question belongs to the attempt; T-207 to load the questions to mark.
- Shuffle: MCQ options use `questionSeed(shuffleSeed, questionId)` (as in LLD §7.3). PBQ MCQ parts (3b, 3c) use `questionSeed(shuffleSeed, "<questionId>:<partId>")`, so two parts with the same option count don't always share a permutation (and the key positions don't correlate). Pick choices (3a) and firewall choices keep their stored order. Review (T-208) must use `paperOptions` / `paperPartOptions`.
- `getState({ attemptId, anonToken })` → `{ status, startedAt, deadline, serverNow, responses: { questionId, value?, flagged, updatedAt }[] }`. `startedAt` (for pacing, LLD §14.3) and `updatedAt` (for merging the local cache, T-212) are additions to the LLD shape. `value` is typed as `AnswerValue`; T-206 must store only valid values or this query fails its return validator.
- `serverNow` is `Date.now()` in a query: a cached result can carry an older time. Fine as a clock estimate; T-212 may prefer the `serverNow` from `start` or a mutation if drift matters.
- Leak test: field-name scan, exact key sets per question, and a value scan — every string in the version's `answerKeys` (explanations, practice answers, key parts) that doesn't already appear in the question content must not appear in the paper. Also checks the paper is unchanged with every answer key deleted. T-209 generalises this to all student functions.
