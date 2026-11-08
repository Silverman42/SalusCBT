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

- [ ] Published versions can't be changed.
- [ ] Tutor can't see another tutor's versions.
