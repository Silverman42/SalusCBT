# T-209 · Answer-key leak test over every student function

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-208](T-208-review-queries.md) |
| Requirements | `SE-1` |
| Design refs | LLD §17 (leak row); PRD success metric |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

An automated guard that fails the build if any student-reachable function returns key data before submission.

## Steps

- Enumerate every public query/mutation a student can call (attempts.*, review.*, shareLinks.*, content.*, classes.lookupCode).
- Seed an in-progress attempt; call each; fail if JSON contains any `correct`, key `parts` value or `explanation` text.
- Make the list self-checking: fail if a new public function isn't classified.

## Files

- `tests/convex/leak.test.ts`

## Acceptance criteria

- [x] Test runs in CI and passes.
- [x] Adding a new unclassified public function fails the test.
- [x] Stage 2 gate, leak part: answer keys are absent from every student response (this test; the gate itself is ticked in TRACKER.md at stage sign-off).

## Notes

- Done 2026-11-08. `tests/convex/leak.test.ts` (11 cases, real seed). No leak found; no source changes.
- Discovery: eager `import.meta.glob` over `convex/**/*.ts` (minus `_generated/` and `*.config.ts`, whose component configs don't load outside the Convex bundler); every export with `isPublic` (query / mutation / action), `isHttp` or `isRouter` is a public entry point. The discovered set must equal the classified set exactly, so a new public function (e.g. T-603's `editor.validate` / `publish`, T-504's `shareLinks.*`) fails the test until it is added to `STUDENT_FACING` (and the scan) or `STAFF_ONLY` (with args), and a removed one fails too.
- Classification: student-facing `attempts.{start,getPaper,getState,saveResponse,submit}`, `review.{getResult,getReview,myAttempts}`, `classes.lookupCode`, `invitations.{peek,accept}`, `profiles.me`. Staff-only (tutor): `classes.{create,update,mine,attempts,stats,attemptResult,attemptReview}`, `editor.{myVersions,createDraft,getDraft,saveQuestion,deleteQuestion,reorder}`; (admin): `admin.{tutors,removeTutor,restoreTutor,audit,deleteAttempts}`, `invitations.{create,list,resend,cancel}`. HTTP: `http.default` (Better Auth routes).
- Staff-only functions are called anonymously (`UNAUTHENTICATED`), as a signed-in user with no profile (`FORBIDDEN`), admin-only ones as a tutor (`FORBIDDEN`); `classes.attemptReview` / `attemptResult` / `stats` as another tutor (`NOT_FOUND`).
- Scan: a whole sitting (lookup, invite peek/accept, `me`, start a class attempt and a retake, papers, state, a neutral save for every question, history, refused result/review, submit twice, a refused late save, result/state/paper/history after submit, non-owner and bad-token calls). Every response and every error (message + data) is deep-scanned for key field names (`correct`, `correctAnswer`, `explanation`, `practice`, `practiceAnswer`, `answerKeys`, `key(s)`, `modelAnswer`, `labAnswers`, `earned`, `partResults`) and for key values that are not in student-visible seed content (explanations and their first 40 chars, practice answers, PBQ part / firewall key values of 4+ chars, lab answers, oral model answers). It runs twice: on the real keys, and with every stored key value rewritten to a `LEAKCANARY-…` string so short values (option ids, ports, counts) are caught as well. The only exception is the owner's `review.getReview` after submission, which must contain keys (this also proves the detector sees the run's keys); before submission, for a non-owner and with a bad token it must refuse. The scan asserts it called every student-facing function.
- Static check: the only declarations that touch the `answerKeys` table (`query/get/insert/patch/replace/delete/doc("answerKeys")`, comments stripped) are `attempts.finalise`, `lib/review.buildReview`, the editor's guarded functions and helpers, and the internal seed functions; and `buildReview`, `finalise`, `readContent`, `keysOf`, `tallyVersion`, `answerKeyDoc` are only used from guarded or internal declarations. A new reader fails it until it is reviewed and allow-listed.
- Checked by hand that the test fails when `classes.lookupCode` returns an explanation (both runs plus the static check) or an MCQ's correct option ids (canary run plus static check).

