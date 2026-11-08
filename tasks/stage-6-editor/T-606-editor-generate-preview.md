# T-606 · editor.generate and preview attempts

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-603](T-603-editor-validate-publish.md), [T-604](T-604-generators-sshlog-nmap.md), [T-605](T-605-generators-rest.md) |
| Requirements | `ED-1`, `ED-2` |
| Design refs | LLD §5.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

"Generate new values" and preview-as-student.

## Steps

- `editor.generate({ versionId, questionId, seed? })` runs the template generator and saves question + key to the draft.
- `editor.previewAttempt({ versionId })` → `{ attemptId, anonToken }`, flagged `preview`, no class, excluded from stats.

## Files

- `convex/editor.ts`
- `convex/schema.ts (preview flag)`

## Acceptance criteria

- [x] Preview marks against the draft correctly.
- [x] Preview attempts never appear on dashboards.

## Notes

- 2026-11-08: Done in `convex/editor.ts`. Public: `editor.generate` (mutation, `{ versionId, questionId, seed? }` → `{ seed, question, key }`) and `editor.previewAttempt` (mutation, `{ versionId, mode? }` → `{ attemptId, anonToken, deadline, serverNow }`). Both in `STAFF_ONLY` in `tests/convex/leak.test.ts`; `generate` added to the `answerKeys` / `keysOf` / `answerKeyDoc` allow-lists (it writes the key and returns it to the author).
- `generate`: draft only (`requireEditableDraft`), PBQs only. Runs `convex/generators` for the question's template, with set B part ids for `pbqB`. The seed must be a uint32; a random one (`randomUint32`) is chosen when omitted and returned (not stored: `questions` has no seed field). Replaces payload, points, key and explanation; keeps stem, domain, section, order and number. The output goes through `checkQuestion`; a failure there is a generator bug (plain `Error`).
- `previewAttempt`: author only (`requireAuthoredVersion`: own version, or any for the admin), any status; a tutor can't preview the default (they copy it). Creates a classless attempt with a fresh server-generated anon token (only its hash stored), `preview: true`, `previewBy`, standard time limit, autoSubmit scheduled. The UI sits it through the ordinary `attempts.*` / `review.*` functions with that token, so marking is the real `finalise`, against the version's questions and keys at submit time. Excluded from dashboards and stats because those read by class; `review.myAttempts` reads by anon key and no student token matches. One preview per author, version and mode: a new one deletes the earlier one (`lib/attemptDeletion.deleteAttempts`).
- Schema (additive): `attempts.preview?: boolean`, `attempts.previewBy?: Id<"profiles">`, index `by_previewBy_version` (`previewBy, versionId, startedAt`). The `mode` argument is an addition to the LLD signature (to preview set B).
- T-602 open note resolved: `deleteQuestion` deletes that question's responses on the caller's preview attempts of the draft (other orphan rows were already ignored by `finalise` and review, and go when the attempt is deleted).
- Tests: `tests/convex/editor/generate.test.ts` (all 10 PBQs generated → validate clean → publish; seed reproduces; refusals; preview full marks in both modes incl. review; marks against the draft at submit; author only; replacement; delete cleanup; absent from `classes.attempts` / `classes.stats` / `review.myAttempts`; an attempt on the published version still marks 102/102).
