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

- [ ] Choose TWO with one correct id blocks publish.
- [ ] Retake disabled (warning) if set B incomplete.
