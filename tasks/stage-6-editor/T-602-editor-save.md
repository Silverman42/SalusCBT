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

- [ ] Saving to a published version fails.
- [ ] Invalid payload rejected with field-level errors.
