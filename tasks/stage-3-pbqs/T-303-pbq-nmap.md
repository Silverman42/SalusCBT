# T-303 · PbqNmap component (insecure services)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-213](../stage-2-exam-engine/T-213-exam-runner-ui.md) |
| Requirements | `PB-1`, `QA-2` |
| Design refs | LLD §14.4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

nmap output where each port row can be picked.

## Steps

- Render `nmap -sV` output as a table.
- Click or Enter on a row fills the focused answer.
- `portPair` parts get two inputs (cleartext first, secure second).

## Files

- `app/components/pbq/PbqNmap.vue`

## Acceptance criteria

- [ ] Row picking works with keyboard only.
