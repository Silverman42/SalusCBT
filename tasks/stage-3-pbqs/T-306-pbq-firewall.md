# T-306 · PbqFirewall component (perimeter firewall)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-213](../stage-2-exam-engine/T-213-exam-runner-ui.md) |
| Requirements | `PB-3`, `QA-2` |
| Design refs | LLD §14.4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Network diagram plus a rule table with Port and Action dropdowns.

## Steps

- SVG diagram drawn from the payload's text (no HTML injection).
- Rule table with native `<select>` for port and action per rule.

## Files

- `app/components/pbq/PbqFirewall.vue`

## Acceptance criteria

- [ ] Dropdowns are keyboard-operable.
- [ ] Diagram readable in dark and light themes.
