# T-109 · seed.importExam and the Stage 1 gate

| | |
| --- | --- |
| Stage | 1 · Setup |
| Depends on | [T-104](T-104-convex-schema.md), [T-108](T-108-parser-tests-seed-json.md) |
| Requirements | `AR-1`, `ED-7`, `ED-4` |
| Design refs | LLD §6.3, §5.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Load the seed into Convex as the published default version.

## Steps

- Write internal mutation `seed.importExam({ seed })`: create exam (slug `sy0-701`), version 1 (`ownerId` undefined), questions, answerKeys, oralQuestions; publish; set `exams.defaultVersionId`.
- Idempotent per slug: if the exam exists, create the next default version, never overwrite.
- Validate payloads with `validatePayload` before insert.
- If the argument is too large, split into per-section calls in a wrapper script.
- Add `npm run seed` running the two commands from §6.3.

## Files

- `convex/seed.ts`
- `scripts/seed.sh or package.json script`

## Acceptance criteria

- [x] **Stage 1 gate:** 85 MCQs, 10 PBQs (A and B), all answer keys, 102 total points, no errors.
- [x] Running the seed twice creates version 2, not duplicates.

## Tests

- convex-test: import twice; counts and points verified.

## Notes

- The source title is `CompTIA Security+ (SY0-701) Mock Exam`. Seed `exams.title` as a "Security+ style practice exam" so the app makes no official claim (QA-5).
- 2026-11-08 (T-109 done, not yet committed):
  - `convex/seed.ts`: `importExam` (internal mutation, args `{ seed }` checked by `seedExamValidator`, which a compile-time assertion ties to `SeedExam`). Before writing it runs `checkSeed`: `validatePayload` / `validatePbqKey` on every PBQ, MCQ option/key/`chooseCount` rules, one key per question, PBQ points = scored parts, 102 total, set B = set A points, domain totals. Any problem throws `ConvexError({ code: "VALIDATION_FAILED", issues })` and nothing is written. Writes exam (first run only), a published default version (`label` "Default", `ownerId` unset), questions (built field by field, SE-1), answer keys, oral questions, sets `defaultVersionId` and writes `version.published` + `exam.default_changed` audit rows. A later run adds version N+1 and moves the default; old versions stay published and unchanged. `lab` / `labAnswers` are accepted but not stored (Stage 7 decides).
  - `seed.summary({ slug })` (internal query) returns counts per default version for the gate check; never returns keys.
  - `exams.title` is seeded as `Security+ style practice exam (SY0-701)` (QA-5); the parser output keeps the source title. Re-runs do not change exam fields.
  - Schema: `questions.payload` and `answerKeys.parts` now use `pbqPayloadValidator` / `pbqKeyValidator` (the T-105 TODOs). `responses.value` is still `v.any()`.
  - Run: `npm run seed:import` (`scripts/seed-import.ts` compacts the JSON, wraps it as `{ seed }`, and runs `npx convex run seed:importExam …`; extra args such as `-- --prod` are passed through). `npm run seed` runs `seed:json` then `seed:import`. Compacting matters: the pretty file is ~150 KB, over Linux's 128 KiB single-argument limit; compact it is ~120 KB, and the script refuses above 125 KB (split per section then).
  - Gate on dev `blissful-spaniel-919`: `seed:summary` shows version 1 published, 85 MCQs, 5 + 5 PBQs, 95 keys, 10 oral questions, 4 Choose TWO, 102 points, domains 13/22/19/31/17, no errors.
  - Tests: `tests/convex/seed.test.ts` (import, counts, no key fields on questions, second run = version 2, bad seeds rejected with nothing written).
  - Parser fix (from T-108): the MCQ numbering check (`checkMcqNumbering` in `scripts/lib/mcq.ts`) now runs right after Part 2 is parsed, so a gap is reported even when Part 6 or the header is broken. Test in `tests/unit/seed-json.test.ts` (fixture Q6 → Q8). Seed JSON unchanged.
