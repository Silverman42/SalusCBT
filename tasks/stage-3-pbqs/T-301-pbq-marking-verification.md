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

- [x] **Stage 3 gate:** all 10 PBQs mark correctly against Part 6.
- [x] Every PBQ's Part 6 solution, rebuilt from the source text, scores full marks; max = heading points = domain-table points.
- [x] Variants accepted per LLD §8.1 (case, whitespace, leading zeros, `0640`, `shadow`, `any`) still score.
- [x] Wrong answers and traps lose exactly their own part or rule; practice parts (1d, B1d) never add points.

## Notes

- 2026-11-08: `tests/unit/pbq-marking.test.ts` (143 cases). Answers are parsed from the Part 6 bullets (not the key objects) and cross-checked against the Part 1 / Part 4 exhibits: the 1c count, attacker IP and compromised account are rederived from the auth log, the failed file from the two hash listings, the world-writable `/etc` file from `ls -l`, and firewall rows against the payload. Traps covered: `grep IP | wc -l` over-count, all-source failure count, decoy IPs and accounts, near-miss hash and passing files, `644` vs `640`, id_rsa left at 644, swapped 4b/4c, swapped 2a/2b, port-pair order, B2b/B2c decoys, wrong action on the right port, deny-all first, last rule ALLOW, swapped rules. Whole papers A and B with the Part 6 answers score 102 → 900 with every domain full.
- No marking or parser bugs found; no changes to `convex/marking/**` or `scripts/lib/**`.
- Behaviour pinned that may be worth a product decision: `PermitRootLogin no` (directive with value), `23/tcp`, `etc/shadow` (no leading slash) and `400` for id_rsa are all marked wrong; firewall actions are exact ids (`allow` is wrong; the UI only offers ALLOW / DENY).
