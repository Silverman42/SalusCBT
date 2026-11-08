# T-201 · Marking: answer normalisers

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-105](../stage-1-setup/T-105-shared-types.md) |
| Requirements | `PB-1`, `EX-13` |
| Design refs | LLD §8.1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Pure functions that turn student input into a canonical form before comparison.

## Steps

- Implement `norm.ip`, `text`/`directive`, `path` (accept missing `/etc/`), `integer`, `octal` (`^0?[0-7]{3}$`), `port` (1–65535 or `Any`), `portPair` (order-sensitive), `pick`/`mcq`.
- Implement `norm.equal(kind, got, want)`.

## Files

- `convex/marking/normalise.ts`

## Acceptance criteria

- [ ] `0640` = `640`; `permitrootlogin` = `PermitRootLogin`; `shadow` = `/etc/shadow`; `any` = `Any`.

## Tests

- Vitest: table of accepted and rejected inputs per kind.
