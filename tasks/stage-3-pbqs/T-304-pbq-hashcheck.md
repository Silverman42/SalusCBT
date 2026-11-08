# T-304 · PbqHashCheck component (installer integrity)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-213](../stage-2-exam-engine/T-213-exam-runner-ui.md) |
| Requirements | `PB-1`, `QA-2` |
| Design refs | LLD §14.4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Vendor and computed hashes side by side.

## Steps

- Align vendor and computed hashes by filename.
- Full hash always visible (no truncation) — wraps on small screens.
- Filename pick part, then two shuffled MC parts (3b, 3c).

## Files

- `app/components/pbq/PbqHashCheck.vue`

## Acceptance criteria

- [ ] Readable at 360 px without hiding characters.
