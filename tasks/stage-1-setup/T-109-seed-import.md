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

- [ ] **Stage 1 gate:** 85 MCQs, 10 PBQs (A and B), all answer keys, 102 total points, no errors.
- [ ] Running the seed twice creates version 2, not duplicates.

## Tests

- convex-test: import twice; counts and points verified.

## Notes

- The source title is `CompTIA Security+ (SY0-701) Mock Exam`. Seed `exams.title` as a "Security+ style practice exam" so the app makes no official claim (QA-5).
