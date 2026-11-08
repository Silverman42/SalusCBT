# T-002 · Accept or reject the 7 pending PRD review suggestions

| | |
| --- | --- |
| Stage | 0 · Decisions and inputs |
| Depends on | None |
| Requirements | `EX-9`, `EX-20`, `EX-21`, `SE-3`, `SE-4`, `SE-5`, `LB-9` |
| Design refs | PRD Appendix; https://claude.ai/artifact/KwNiKaPLj5cM6SFX3kgt9H |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

The HLD and LLD already follow seven suggestions that are not yet accepted in the PRD. Settle them so tasks built on them aren't reworked.

## Steps

- Review each suggestion in the shared PRD doc and accept or reject it:
  1. EX-9: 4 Choose TWO questions (Q20, Q26, Q50, Q78), not 5.
  2. EX-20: export file contains the anonymous ID; warn the student to keep it private.
  3. EX-21 (new): per-class time multiplier for extra time; pacing alerts scale with it.
  4. SE-3: anonymous ID is random and treated as a secret (note: the LLD uses a 256-bit token, stronger than the 128-bit in the suggestion).
  5. SE-4: 30-second grace period at the time limit.
  6. SE-5: 10 starts/hour per anonymous ID plus ~200/hour per IP.
  7. Release plan: LB-9 (`build-lab.sh` download) moves to Stage 3.
- Update `docs/PRD.md` and record each outcome in the tracker's decision log.

## Files

- `docs/PRD.md`
- `tasks/TRACKER.md (decision log)`

## Acceptance criteria

- [x] All 7 items are marked accepted or rejected in the PRD.
- [x] Any rejected item is reflected in the affected tasks (listed in Notes). None were rejected.

## Notes

- **2026-11-08: all 7 accepted** in the shared doc (now rev 80). `docs/PRD.md` is updated to match, and its appendix is removed. Affected tasks no longer carry "depends on T-002" notes.
- Earlier check: the shared doc still has 7 open suggestions (rev 69), so none are accepted yet. The source file confirms #1 as a fact: 4 Choose TWO questions (Q20, Q26, Q50, Q78).
- Affected tasks: #1 → T-107, T-202; #2 → T-210, T-217; #3 → T-204, T-214, T-509; #4 → T-106, T-210; #5 → T-206, T-207; #6 → T-204, T-106; #7 → T-308.
