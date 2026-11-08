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

- [ ] Preview marks against the draft correctly.
- [ ] Preview attempts never appear on dashboards.
