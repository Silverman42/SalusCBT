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

- [ ] Exactly one installer reports FAILED per session.
