# T-301 · Mark all 10 PBQs against the Part 6 solutions

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-202](../stage-2-exam-engine/T-202-marking-score.md), [T-109](../stage-1-setup/T-109-seed-import.md) |
| Requirements | `PB-1`, `PB-2`, `PB-3`, `PB-5` |
| Design refs | LLD §17 (Marking row) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Confirm the marking engine gives full marks for every official PBQ answer.

## Steps

- For each of A1–A5 and B1–B5, build an answer from the Part 6 solution and score it.
- Add variant inputs (case, leading zero, missing `/etc/`) that must still score.
- Add wrong-answer cases per part (e.g. firewall right port, wrong action → 0 for that rule).

## Files

- `tests/unit/pbq-marking.test.ts`

## Acceptance criteria

- [ ] **Stage 3 gate:** all 10 PBQs mark correctly against Part 6.
