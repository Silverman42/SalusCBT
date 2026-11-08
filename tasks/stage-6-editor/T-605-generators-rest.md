# T-605 · Generators: hashCheck, permissions and firewall

| | |
| --- | --- |
| Stage | 6 · Question editor |
| Depends on | [T-105](../stage-1-setup/T-105-shared-types.md) |
| Requirements | `ED-6` |
| Design refs | LLD §10.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Complete the five template generators.

## Steps

- `hashCheck.ts`: four files, random 64-hex hashes, tampered file keeps first/last 6 chars.
- `permissions.ts`: pick sensitive file (`shadow`/`gshadow`/`sudoers`), compute correct mode; key `600` for private key.
- `firewall.ts`: web or mail scenario; port choices include answers + distractors; last rule `Any / DENY`.

## Files

- `convex/generators/hashCheck.ts`
- `convex/generators/permissions.ts`
- `convex/generators/firewall.ts`

## Acceptance criteria

- [ ] Deterministic per seed.

## Tests

- Vitest: 1,000 seeds each.
