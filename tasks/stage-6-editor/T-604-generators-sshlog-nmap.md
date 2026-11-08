# T-604 · Generators: sshLog and nmap

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-105](../stage-1-setup/T-105-shared-types.md) |
| Requirements | `ED-6` |
| Design refs | LLD §10.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Deterministic generators that produce new values and compute their own keys.

## Steps

- `generators/sshLog.ts`: attacker from `203.0.113.0/24` / `198.51.100.0/24`, decoys, 40–60 failures, one `Accepted password`; key computed from the text.
- `generators/nmap.ts`: host role, service table, one cleartext service + secure replacement; key from the table.

## Files

- `convex/generators/sshLog.ts`
- `convex/generators/nmap.ts`

## Acceptance criteria

- [ ] Only documentation/reserved IP ranges or the default content's ranges are used.

## Tests

- Vitest: 1,000 seeds each pass validation and recomputed keys match.
