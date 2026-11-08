# T-701 · Terminal lab: virtual file system and seedLab

| | |
| --- | --- |
| Stage | 7 · Terminal lab |
| Depends on | [T-001](../stage-0-decisions/T-001-add-source-content.md) |
| Requirements | `LB-4`, `LB-5`, `LB-7` |
| Design refs | LLD §13.1, §13.2; HLD D10 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

In-memory copy of everything `build-lab.sh` creates.

## Steps

- `vfs.ts`: path → `{ content: Uint8Array | string, mode, owner, group, mtime }`; cwd handling.
- `seedLab.ts`: `auth.log` from the script's lines; four 2 MiB random installers with real SHA-256 in `vendor_hashes.txt`, then append `injected-payload` to one at random; `etc/`, `home/deploy/.ssh` with the script's modes.
- Reset = call `seedLab()` again.

## Files

- `app/lib/terminal/vfs.ts`
- `app/lib/terminal/seedLab.ts`

## Acceptance criteria

- [ ] File tree matches a real `build-lab.sh` run.

## Notes

- `build-lab.sh` writes the Lab B answer to a hidden file `~/secplus-lab/.answer-lab-b` (line 150). Don't create it in the virtual file system, or `ls -la` and `cat` would give the answer away. Keep the tampered filename in memory for the Lab B check.
