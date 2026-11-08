# T-705 · Lab command: sha256sum and sha256sum -c

| | |
| --- | --- |
| Stage | 7 · Terminal lab |
| Depends on | [T-701](T-701-lab-vfs-seed.md) |
| Requirements | `LB-2`, `LB-5` |
| Design refs | LLD §13.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Real hashes with Web Crypto for Lab B.

## Steps

- `sha256sum <files>` and `sha256sum -c vendor_hashes.txt` with OK/FAILED lines.

## Files

- `app/lib/terminal/commands/sha256sum.ts`

## Acceptance criteria

- [x] Exactly one installer reports FAILED per session.

## Notes

- Done in `app/lib/terminal/commands/sha256sum.ts` (async, Web Crypto through `seedLab`'s `sha256Hex`). `tests/unit/terminal-sha256sum.test.ts` compares hashes with `node:crypto` and runs `sha256sum -c vendor_hashes.txt` on the seed once per possible victim: one `FAILED`, three `OK`, `sha256sum: WARNING: 1 computed checksum did NOT match` on stderr, status 1.
- Follows GNU coreutils 9.x: `<hex>  <name>` (`-b` gives ` *`), `-` or no operand reads stdin, names with `\` or newline are escaped, `-c` prints `OK`, `FAILED` or `FAILED open or read`, skips comments, blank lines and CRs, accepts BSD `SHA256 (f) = hex` lines, prints the three WARNING summaries (singular and plural) and `no properly formatted checksum lines found` (`'standard input'` for stdin). Also `--quiet`, `--status`, `--strict`, `-w` and `--ignore-missing`. coreutils 8.x (Ubuntu 22.04) says `no properly formatted SHA256 checksum lines found`, and Ubuntu 25.10+ ships uutils; the T-707 fixtures decide whether any wording needs to change.
