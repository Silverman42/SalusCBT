# T-603 · Editor: validate, publish and restore

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-602](T-602-editor-save.md) |
| Requirements | `ED-1`, `ED-2`, `ED-3`, `ED-9`, `ED-10` |
| Design refs | LLD §10.2, §10.1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Block bad versions; publish good ones as new numbered versions.

## Steps

- `editor.validate` → `Issue[]` with every rule and severity in §10.2 (including recomputing generated answers).
- `editor.publish`: fail on errors (`VALIDATION_FAILED`), compute `totalPoints`, freeze, audit `version.published` (and `exam.default_changed` for the admin).
- Restore = `createDraft` from an older published version.

## Files

- `convex/editor.ts`

## Acceptance criteria

- [x] Choose TWO with one correct id blocks publish.
- [x] Retake disabled (warning) if set B incomplete.

## Notes

- 2026-11-08: Done in `convex/editor.ts`. Public: `editor.validate` (query, `{ versionId }` → `Issue[]`, author only) and `editor.publish` (mutation, `{ versionId }` → `{ versionId, versionNo, totalPoints, publishedAt, isDefault, warnings }`). Pure helpers `checkVersion`, `recomputeIssues`, `formatIssue`. Both added to `STAFF_ONLY` in `tests/convex/leak.test.ts`.
- `Issue = { severity, rule, questionId, displayNumber, message }`. Errors: `shape` (T-602's `checkQuestion` re-run on the stored row), `key.missing`, `key.duplicate`, `explanation`, `mcq.chooseCount`, `pbq.recompute` (ED-2: sshLog IP/account/count via `sshLogAnswers`, hashCheck file via `hashCheckTampered`, compared with the marking normalisers), `points`, `total`, `sets.balance` (set B, if any, worth the same as set A). Warnings: `sets.incomplete` (5 PBQs per set; set B short → retake disabled), `domains.spread` (share more than 10 points off the SY0-701 weight).
- Publish throws `VALIDATION_FAILED` with `issues: string[]` (errors only, `question N: …`), like save. `totalPoints` = set A + MCQs (as the seed). An admin (default-line) publish sets `exams.defaultVersionId` and audits `exam.default_changed`; the previous default is **not** archived, because `attempts.start` and classes only accept published versions and publishing must not touch older versions.
- Restore (ED-3) needs no new function: `createDraft` from the older version, then `publish`.
- "Retake disabled" is reported as a warning only; `attempts.start` does not yet refuse a retake on a version without set B (outside this task).
- Tests: `tests/convex/editor/publish.test.ts` (seed validates clean; Choose TWO; ED-2 on seed and generated PBQs; sets; totals; audit; default change; restore; a v1 attempt still marks 102/102 against v1 after v2 is published, and v1 rows are byte-identical).
