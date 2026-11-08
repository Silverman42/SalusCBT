# T-707 · Lab fixture tests against a real build-lab.sh run

| | |
| --- | --- |
| Stage | 7 · Terminal lab |
| Depends on | [T-706](T-706-lab-page-checks.md) |
| Requirements | `LB-*` |
| Design refs | LLD §13.2 (Tests), §17 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Stage 7 gate.

## Steps

- Run `build-lab.sh` on Ubuntu, capture outputs of every lab-step command as fixtures (excluding the random tampered file/hashes).
- Vitest runs every lab command against `seedLab()` and compares.

## Files

- `tests/fixtures/lab/*`
- `tests/unit/terminal.test.ts`

## Acceptance criteria

- [ ] **Stage 7 gate:** every lab command matches; Labs A–C give the Part 6 answers.
