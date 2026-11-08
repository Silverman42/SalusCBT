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

- [ ] Runs with `npx tsx scripts/parse-exam.ts <file> > content/seed/sy0-701.json`.
- [ ] Output has 85 MCQs (Q6–Q90), 10 PBQs, all keys, 10 oral questions.
- [ ] Choose TWO count matches the key (4 expected: Q20, Q26, Q50, Q78, per EX-9).
- [ ] Domain totals 13 + 22 + 19 + 31 + 17 = 102.

## Notes

- Found in the source file (2026-11-08):
  - Lines starting with `# ` also appear **inside fenced code blocks** (sshd_config comments in PBQ 4/B4, the lab script in Part 5). Split on `# Part N:` headings only outside fences.
  - `# Part 3: Answer sheet` is for paper; skip it.
  - Part 6 subsections: `## Part 1 PBQ solutions`, `## Part 2 multiple-choice key`, `### Domain breakdown`, `### Score conversion`, `## Part 4 retake solutions (version B)`, `## Part 5 hands-on lab answers`, `## Oral questions (ask after the exam)`.
  - Use the `### Score conversion` table as an extra test fixture for T-202.

