# T-601 · Editor: copy-on-write versions

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-404](../stage-4-auth/T-404-profiles-admin-bootstrap.md), [T-109](../stage-1-setup/T-109-seed-import.md) |
| Requirements | `ED-3`, `ED-4`, `ED-5`, `ED-7` |
| Design refs | LLD §10.1; HLD D8 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Tutors get their own editable copy of an exam version.

## Steps

- `editor.createDraft({ fromVersionId, label })`: copy questions, keys, oral questions; `ownerId = caller`, `parentVersionId`, `versionNo = max + 1`.
- `editor.myVersions`, `editor.getDraft` (owner only; keys allowed).
- Default version drafts only for the admin.

## Files

- `convex/editor.ts`

## Acceptance criteria

- [x] Published versions can't be changed.
- [x] Tutor can't see another tutor's versions.

## Notes

- `convex/editor.ts`: `createDraft({ fromVersionId, label }) → { versionId, versionNo }`,
  `myVersions({}) → VersionSummary[]`, `getDraft({ versionId }) → { version, questions: { question, key | null }[], oral }`.
  Exported guards for T-602/T-603/T-606: `requireEditableDraft`, `requireAuthoredVersion`,
  `requireVisibleVersion`, `canEdit`.
- The source version is only read, so published versions and the attempts pinned to them never
  change (ED-4). Editing a non-draft through `requireEditableDraft` fails `VALIDATION_FAILED`
  (`{ code, issues }`, like `seed.importExam`); someone else's version is `NOT_FOUND`.
- "Default version drafts only for the admin": the admin's drafts go in the default line
  (`ownerId` undefined, numbered after the seeded versions), so T-603's publish can make them the
  default without rewriting `ownerId`. Tutors copy a published default into their own line (ED-7).
  The admin can see and read every version but edits only default-line drafts (LLD §10.1).
- Visibility (ED-5): tutors see their own versions plus published defaults; default-line drafts
  and other tutors' versions are `NOT_FOUND`. `getDraft` (keys) is author-only: tutors can't read
  the default's keys through it (they get them by copying).
- Transaction size: copying the default is ~96 reads + ~200 writes, far inside one mutation's
  limits; versions are capped at `MAX_VERSION_QUESTIONS = 500` / `MAX_VERSION_ORAL = 100`, so no
  scheduler batching is needed.
- No audit row on draft creation: §12.2 has no `version.*` event besides `version.published`.
- Tests: `tests/convex/editor/versions.test.ts` (12, real seed import).
