# T-107 · Markdown exam parser with validation

| | |
| --- | --- |
| Stage | 1 · Setup |
| Depends on | [T-001](../stage-0-decisions/T-001-add-source-content.md), [T-105](T-105-shared-types.md) |
| Requirements | `AR-1`, `PB-5`, `ED-7`, `EX-9` |
| Design refs | LLD §6.1, §6.2; HLD D11 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Turn `secplus-701-mock-exam.md` into a typed `SeedExam` JSON, failing loudly with line numbers on any format drift.

## Steps

- Split by `# Part N`; extract header (time limit, count, pass mark).
- Part 1 and Part 4: PBQs A1–A5 and B1–B5 — fenced text blocks, part prompts `**1a.**`, inline options, firewall table, `Port choices` / `Action choices`.
- Part 2: 85 MCQs — `**N.**`, `**(Choose TWO)**`, options `- X. text`.
- Part 5: lab steps and cheat sheet (stored for Stage 7).
- Part 6: PBQ solutions, MCQ key rows, domain table, 10 oral questions + model answers.
- Apply parse-time normalisation (first token for octal, option id from `B. …`, firewall `443 / ALLOW`, B2 port pairs, practice parts 1d/B1d).
- Validate per §6.2; print errors with source line numbers and exit non-zero.

## Files

- `scripts/parse-exam.ts`
- `scripts/lib/*.ts`

## Acceptance criteria

- [x] Runs with `npx tsx scripts/parse-exam.ts <file> > content/seed/sy0-701.json`.
- [x] Output has 85 MCQs (Q6–Q90), 10 PBQs, all keys, 10 oral questions.
- [x] Choose TWO count matches the key (4 expected: Q20, Q26, Q50, Q78, per EX-9).
- [x] Domain totals 13 + 22 + 19 + 31 + 17 = 102.

## Notes

- Found in the source file (2026-11-08):
  - Lines starting with `# ` also appear **inside fenced code blocks** (sshd_config comments in PBQ 4/B4, the lab script in Part 5). Split on `# Part N:` headings only outside fences.
  - `# Part 3: Answer sheet` is for paper; skip it.
  - Part 6 subsections: `## Part 1 PBQ solutions`, `## Part 2 multiple-choice key`, `### Domain breakdown`, `### Score conversion`, `## Part 4 retake solutions (version B)`, `## Part 5 hands-on lab answers`, `## Oral questions (ask after the exam)`.
  - Use the `### Score conversion` table as an extra test fixture for T-202.
- Done (2026-11-08):
  - API: `parseExam(source: string): ParseResult` in `scripts/lib/parseExam.ts` (pure, no I/O); `ParseResult` is `{ ok: true, exam: SeedExam }` or `{ ok: false, errors: { line, message }[] }`. Output types in `scripts/lib/types.ts`. The CLI prints `<file>:<line>: <message>` per problem to stderr and exits 1; all problems are reported in one run.
  - `SeedExam` = `exam` (the `exams` table fields), `scoring` (scale, totals, conversion rows), `domains`, `questions` (student-visible, `questions` table shape, keyed by `displayNumber`), `answerKeys` (server-only: `correct` / `parts: PbqKey` / `explanation`), `oralQuestions`, `lab` (Part 5 intro, steps, cheat sheet) and `labAnswers`.
  - Real source gives: 85 MCQs (Q6–Q90), 10 PBQs (1–5, B1–B5), 95 keys, Choose TWO = Q20, Q26, Q50, Q78, domains 13/22/19/31/17 = 102, 10 oral questions, 9 score rows, 5 lab steps, 11 cheat-sheet rows.
  - Template is chosen by PBQ number (1 sshLog, 2 nmap, 3 hashCheck, 4 permissions, 5 firewall); set B uses its twin's template and domain. Part kinds: sshLog ip/text/integer, permissions path/octal/octal/directive, nmap port or portPair (two bold ports in the solution), hashCheck pick (choices = file names in `vendor_hashes.txt`) or mcq (inline options).
  - PBQ ids are `1a`…, `B1a`…; the practice prompt prefix "(Practice, not scored)" is stripped and the part gets `scored: false`. B2 has no prose explanation, so its key explanation is the solution bullets without bold.
  - Part 3 is optional and ignored. A ```` ```lang ```` fence while another is open is reported at the unclosed opening line.
  - `scripts/tsconfig.json` type-checks `scripts/`, `shared/` and `tests/unit/parser.test.ts`; it is wired into `npm run typecheck`.
  - For T-108: `JSON.stringify(…, null, 2)` output is not Prettier-formatted, so either add `content/seed` to `.prettierignore` or run Prettier on the seed after generating it.
