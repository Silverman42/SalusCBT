# T-510 · Class isolation and dashboard latency tests

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-505](T-505-tutor-ui-classes.md), [T-504](T-504-share-links.md) |
| Requirements | `SE-2`, `SE-3`, `CL-5` |
| Design refs | LLD §17 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Stage 5 gate.

## Steps

- convex-test: tutor A cannot read/update/delete tutor B's classes or attempts; admin can.
- Playwright: tutor dashboard open, student submits, row appears within 5 s.
- Share link create/revoke flow.

## Files

- `tests/convex/classes.test.ts`
- `tests/e2e/classes.spec.ts`

## Acceptance criteria

- [ ] **Stage 5 gate:** dashboard update < 5 s; tutors isolated.
