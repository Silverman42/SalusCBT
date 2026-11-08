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

- `tests/convex/editor.test.ts`
- `tests/e2e/editor.spec.ts`

## Acceptance criteria

- [ ] **Stage 6 gate:** generated version passes validation, previews and marks correctly; old attempts unchanged.
