# T-202 · Marking: scoring, scaled score and domain breakdown

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-201](T-201-marking-normalise.md) |
| Requirements | `EX-9`, `EX-13`, `EX-14`, `EX-15`, `PB-2`, `PB-3`, `ED-10` |
| Design refs | LLD §8.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Pure scoring used by submit, review, preview and tutor stats.

## Steps

- `scoreQuestion(q, key, value)`: MCQ both-or-nothing for Choose TWO; firewall per-rule port+action; text/port parts with practice parts excluded.
- `summarise(questions, perQuestion, exam)`: total from question points, `scaled = round(100 + 800 × points / total)`, `passed ≥ 750`, `comfortable ≥ 800`, `byDomain`.
- `byDomain` returns points/max per domain 1.0–5.0; UI highlights < 81% (`exam.domainTarget`).

## Files

- `convex/marking/score.ts`

## Acceptance criteria

- [ ] **Gate tests pass:** 102→900, 95→845, 90→806, 87→782, 83→751 pass, 82→743 fail, 78→712, 70→649, 60→571.
- [ ] Choose TWO with one right answer scores 0.
- [ ] Total adjusts when questions are added/removed (ED-10).

## Tests

- Vitest for every row above plus firewall partial credit.
