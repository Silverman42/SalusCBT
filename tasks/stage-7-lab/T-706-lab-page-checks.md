# T-706 · Lab page: checks, reset and cheat sheet

| | |
| --- | --- |
| Stage | 7 · Terminal lab |
| Depends on | [T-703](T-703-lab-commands-files.md), [T-704](T-704-lab-commands-text.md), [T-705](T-705-lab-sha256.md), [T-308](../stage-3-pbqs/T-308-lab-download.md) |
| Requirements | `LB-6`, `LB-7`, `LB-8` |
| Design refs | LLD §13.2 (Lab checks) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Put the terminal lab together on `/lab`.

## Steps

- `checks.ts`: Lab A by answer entry; B by tampered filename; C when `etc/shadow` 640, `id_rsa` 600, `PermitRootLogin no`.
- "Reset lab" button.
- `CheatSheet.vue` from Part 5 beside the terminal.
- Keep the download section from T-308.

## Files

- `app/lib/terminal/checks.ts`
- `app/components/lab/CheatSheet.vue`
- `app/pages/lab.vue`

## Acceptance criteria

- [ ] Labs A–C show passed when done correctly.
