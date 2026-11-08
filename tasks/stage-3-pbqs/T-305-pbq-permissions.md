# T-305 · PbqPermissions component (permissions and SSH)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-213](../stage-2-exam-engine/T-213-exam-runner-ui.md) |
| Requirements | `PB-1`, `QA-2` |
| Design refs | LLD §14.4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

`ls -l` listings and `sshd_config` shown as a terminal.

## Steps

- Terminal-styled read-only blocks.
- Inputs: filename, two octal modes (`inputmode="numeric"`), directive name.

## Files

- `app/components/pbq/PbqPermissions.vue`

## Acceptance criteria

- [ ] `0640` and `640` both accepted (via marking).
