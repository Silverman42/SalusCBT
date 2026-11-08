# T-503 · CSV export and deleting attempts

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-502](T-502-class-dashboard-queries.md) |
| Requirements | `CL-8`, `CL-11`, `PR-5` |
| Design refs | LLD §5.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Export results and delete attempts with full cascade.

## Steps

- `classes.exportCsv` action: escape fields, guard against CSV formula injection (`=`, `+`, `-`, `@`).
- `classes.deleteAttempts({ attemptIds })` (max 100): owner check per attempt; delete responses and share links; audit `attempt.deleted` with count.

## Files

- `convex/classes.ts`

## Acceptance criteria

- [ ] Deleted attempt's share link returns `null`.
- [ ] CSV opens cleanly in Excel and Sheets.
