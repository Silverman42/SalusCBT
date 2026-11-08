# T-602 · Editor: save, delete and reorder questions

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-601](T-601-editor-versions.md) |
| Requirements | `ED-8`, `ED-9` |
| Design refs | LLD §5.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Draft editing with payload validation on every save.

## Steps

- `editor.saveQuestion({ versionId, question, key })`: draft only; `validatePayload`; MCQ fields from ED-8.
- `editor.deleteQuestion`, `editor.reorder`.

## Files

- `convex/editor.ts`

## Acceptance criteria

- [x] Saving to a published version fails.
- [x] Invalid payload rejected with field-level errors.

## Notes

- `convex/editor.ts`:
  `saveQuestion({ versionId, questionId?, question, key }) → { questionId, displayNumber }`,
  `deleteQuestion({ versionId, questionId }) → null`,
  `reorder({ versionId, section, questionIds }) → null`. Every write goes through
  `requireEditableDraft` (published/archived → `VALIDATION_FAILED`, ED-4; someone else's version
  → `NOT_FOUND`); a `questionId` from another version is `NOT_FOUND`. Each bumps `updatedAt`.
- `question` is a union on `kind` (`mcq`: `section: "mcq"`, `domain`, `stem`, `options`,
  `chooseCount`; `pbq`: `section: pbqA|pbqB`, `domain`, `stem`, `template`, `payload`). `key` is
  shaped like an `answerKeys` row (`correct?`, `parts?`, `explanation`), so `getDraft`'s key can be
  sent straight back. `payload` and `key.parts` are `v.any()` at the argument level and checked by
  `validatePayload` / `validatePbqKey`, so a bad payload comes back as field-level issues instead
  of a generic argument error.
- Errors are `ConvexError({ code: "VALIDATION_FAILED", issues })` with `path: message` strings
  rooted at the argument names, e.g. `question.options[1].id: duplicate option id "A"`,
  `question.payload.parts[0].kind: …`, `key.parts.parts.1b: scored part has no key`. Nothing is
  written on failure. The checks are exported as `checkQuestion(question, key)`.
- Save checks shape (what would leave a row the runner or marking can't use): non-blank stem;
  MCQ 2–6 options with ids `A`–`F`, unique, non-blank text; `chooseCount` 1 or 2; key ids unique
  and among the options; no `parts` on an MCQ key / no `correct` on a PBQ key; full
  `validatePayload` + `validatePbqKey` for PBQs (so every scored part is keyed). Completeness rules
  a tutor fills in over several saves are left to T-603's `validate` (ED-9 says "before
  publishing"): an empty explanation and `correct.length !== chooseCount` (Choose TWO with one
  answer) save fine and must block publish there.
- Server-derived fields: `points` (MCQ 1; PBQ = scored parts, firewall = rules, same rule as
  `seed.ts`, exported as `pbqPoints`), `order` and `displayNumber`. `order` is dense 1..n per
  section; `displayNumber` follows the seed scheme: set A `"1".."n"`, set B `"B1".."Bn"`, MCQs
  numbered on after set A. Adding appends to the section; changing a PBQ's section appends it to
  the other set; delete and section changes renumber the whole version, `reorder` renumbers from
  a full permutation of one section (`questionIds` must list each of its questions exactly once).
  Only rows whose order/number change are patched. All reads are bounded by
  `MAX_VERSION_QUESTIONS`, and adding past it fails.
- `totalPoints` is not touched on save; T-603's publish computes it (ED-10).
- Saving replaces the question and key rows in place (same ids); stray duplicate key rows for a
  question are removed on save, and all of a question's keys go on delete.
- Tests: `tests/convex/editor/save.test.ts` (14, real seed import + a tutor draft).
