# T-609 · Editor tests and Stage 6 gate

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-608](T-608-editor-ui-pbq.md) |
| Requirements | `ED-4`, `ED-5` |
| Design refs | LLD §17 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Prove versioning keeps old results stable.

## Steps

- convex-test: attempt on v1, publish v2, v1 attempt still marks/reviews against v1.
- Ownership: tutor can't edit others' versions or the default.
- Playwright: generate → validate → preview → publish → class uses it.

## Files

- `tests/convex/editor/gate.test.ts` (the other editor tests are in `tests/convex/editor/`)
- `tests/e2e/editor.spec.ts`

## Acceptance criteria

- [x] **Stage 6 gate:** generated version passes validation, previews and marks correctly; old attempts unchanged. (convex-test; the browser half is `tests/e2e/editor.spec.ts`, not yet run live)
- [x] Ownership: a tutor can't read or edit another tutor's version or the default (convex-test).
- [ ] Playwright: generate → validate → preview → publish → class uses it (written and type-checked; needs a live run with `E2E_EDITOR=1`).

## Notes

- `tests/convex/editor/gate.test.ts`, one story through the public functions the UI calls:
  the tutor's class sits the default (v1) and a student starts and answers it with v1's key →
  `myVersions` shows the default read-only → `createDraft` → `generate` every PBQ of both sets
  with fixed seeds (6090–6099; payload and key equal the generator's) → `saveQuestion` turns the
  first Choose ONE MCQ into a Choose TWO with a new stem → `validate` has no errors → preview,
  standard and retake, answered with the `getDraft` keys: full marks, and every review item
  (and every PBQ part) earned = max → `publish` (the default doesn't move) → the class moves to
  the new version and a second class is created on it → the v1 attempt submits at 102/102 against
  v1 and the tutor's review shows the old stem and Choose ONE → a student on v2 with v2's key gets
  full marks; one answering the MCQs with v1's key loses exactly the Choose TWO → class dashboards
  show only their own students. v1's rows (version, questions, keys, oral, `_creationTime`
  included) are byte-identical (`JSON.stringify`) at every step.
- Negative paths: another tutor gets `NOT_FOUND` from `getDraft`, `validate`, `saveQuestion`
  (edit and add), `deleteQuestion`, `reorder`, `generate`, `previewAttempt`, `publish` and
  `createDraft` on a tutor's version, and from `classes.create` once it is published; a tutor
  gets `NOT_FOUND` for those calls on the default and for default questions through their own
  draft (default byte-identical); a validation error blocks publish until fixed; a draft can't be
  given to a class; a published version refuses save / generate / delete / publish
  (`VALIDATION_FAILED`, rows unchanged) but can be previewed and used; anonymous callers get
  `UNAUTHENTICATED`.
- Some generated keys can equal the seed's (e.g. the same nmap answer), so the gate checks that
  at least one PBQ key changed and proves "marked against v2" with the Choose TWO. v1's PBQ
  answers don't fit v2's regenerated payloads (`saveResponse` refuses them), which is correct.
- `tests/e2e/editor.spec.ts` (skipped unless `E2E_EDITOR=1`; prerequisites in its header: the
  T-510 setup, `E2E_TUTOR_EMAIL`, codes read from `npx convex logs`): sign in → New draft from
  the default → PBQs tab → Q1 → Generate new values with seed 609 → Publish enabled (no errors) →
  Preview as student → the generated log is on the page → submit → "Preview result" and "Answer
  review" → back → publish → New class on the version → a student starting with the class code
  gets question 1 with the seed-609 log (`attempts.getPaper`). It type-checks and is listed by
  `playwright test --list`; it hasn't been run against a deployment.
- Checked: `npm run typecheck`, `lint`, `format:check`, `npm test` (79 files, 1431 tests). No bugs
  found; no Convex code changed.
