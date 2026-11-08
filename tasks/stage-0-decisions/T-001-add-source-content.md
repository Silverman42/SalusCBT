# T-001 · Add the source exam and lab files to the repo

| | |
| --- | --- |
| Stage | 0 · Decisions and inputs |
| Depends on | None |
| Requirements | `AR-1`, `PB-5`, `ED-7`, `LB-4` |
| Design refs | LLD §1 (content/source); LLD §6 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

The parser, seed data, PBQ content and terminal lab all come from `secplus-701-mock-exam.md` and `build-lab.sh`. Neither file is in this project yet.

## Steps

- Copy `secplus-701-mock-exam.md` into `content/source/`.
- Copy `build-lab.sh` into `content/source/`.
- Confirm the Markdown file has Parts 1, 2, 4, 5 and 6 in the format the LLD parser rules expect (§6.1).

## Files

- `content/source/secplus-701-mock-exam.md`
- `content/source/build-lab.sh`

## Acceptance criteria

- [x] Both files are committed under `content/source/`.
- [x] A quick read confirms `# Part N` headings, `## PBQ n.` / `## PBQ Bn.` headings and the Part 6 key table exist.

## Notes

- **2026-11-08 check:** both files are in the project root, not yet in `content/source/` (that folder comes with T-101). Results:
  - Parts 1–6 present. Part 3 is a paper answer sheet; the parser skips it.
  - 10 PBQ headings (`## PBQ 1.`–`5.`, `## PBQ B1.`–`B5.`); 85 MCQs numbered 6–90; 85 key rows.
  - Exactly 4 Choose TWO questions: Q20, Q26, Q50, Q78 (keys `A, B`, `D, E`, `B, E`, `A, D`).
  - Domain table totals 13 / 22 / 19 / 31 / 17 = 102; 10 oral questions with model answers; score conversion rows match LLD §8.2.
  - Part 6 Lab A answers match LB-4: `185.220.101.47`, `backup`, `50`.
  - The script in Part 5 matches `build-lab.sh` except for a missing trailing newline.
- Was a blocker; resolved 2026-11-08.
- **Original blocker:** T-107 (parser), T-109 (seed), Stage 3 PBQs and Stage 7 lab all wait on this.
