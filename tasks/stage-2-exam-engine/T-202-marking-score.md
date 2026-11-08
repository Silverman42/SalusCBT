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

- [x] **Gate tests pass:** 102→900, 95→845, 90→806, 87→782, 83→751 pass, 82→743 fail, 78→712, 70→649, 60→571.
- [x] Choose TWO with one right answer scores 0.
- [x] Total adjusts when questions are added/removed (ED-10).

## Tests

- Vitest for every row above plus firewall partial credit.

## Notes

- `convex/marking/score.ts` exports `scoreQuestion`, `summarise`, `byDomain`, `scaledScore`, `isBelowTarget` and `scorePaper`. `scorePaper` is the LLD §7.4 `score`: it looks up keys and answers by question id. It also exports the `MarkQuestion`, `MarkKey`, `QuestionScore`, `ScoreSummary`, `DomainResult` and `Domain` types. The input types are structural, so `questions` / `answerKeys` docs can be passed in directly.
- Firewall ports are compared with `norm.equal("port", …)`, not with `norm.port(a) === norm.port(b)` as the LLD sketch does, so two blanks never match. Actions are compared exactly (`ALLOW` / `DENY`).
- An MCQ with an empty or missing key scores 0, even when the answer is also empty. A PBQ part that is missing from the key scores 0. A missing key does not throw, so a content bug cannot block submit.
- `summarise` takes the total from `q.points` (ED-10) and caps each question's earned points at `q.points`. `perQuestion[i]` must line up with `questions[i]`; it throws if the lengths differ. A paper worth 0 points scores 100.
- `byDomain` always returns all five domains in order. A domain with no questions has `max: 0`, and `isBelowTarget` never flags it.
- Tests: `tests/unit/marking/score.test.ts` builds the full 102-point paper from Part 6 (domains 13/22/19/31/17, Choose TWO on 20/26/50/78). It runs every gate row and also covers partial-credit PBQs, practice parts, unanswered questions and domain totals that add up.
