# T-302 · PbqSshLog component (SSH brute-force alert)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-213](../stage-2-exam-engine/T-213-exam-runner-ui.md) |
| Requirements | `PB-1`, `PB-2`, `QA-2` |
| Design refs | LLD §14.4; PRD PBQ table row 1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Scrollable `auth.log` viewer with search and answer fields.

## Steps

- Virtualised log viewer (~120 lines), monospace.
- Search box with highlight and match count.
- Answer fields 1a–1c (IP, account, count) and practice field 1d (not scored).

## Files

- `app/components/pbq/PbqSshLog.vue`

## Acceptance criteria

- [ ] Search works by keyboard; match count updates live.
- [ ] Practice answer shown only in review.
