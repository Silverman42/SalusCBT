# T-213 · Exam runner UI: questions, flagging, navigator, review-before-submit

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-212](T-212-useAttempt.md) |
| Requirements | `EX-6`, `EX-7`, `EX-8`, `EX-9`, `EX-12`, `QA-2` |
| Design refs | LLD §14.1 (`/exam/[attemptId]`); LLD §1 components/exam |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

The one-question-per-screen exam with full keyboard support.

## Steps

- `QuestionMcq` with display letters by position; Choose TWO allows exactly two.
- Previous / Next / `FlagButton`.
- `Navigator` grid: answered / flagged / unanswered; click or keyboard to jump.
- Pre-submit review screen listing unanswered and flagged questions, then Submit.
- Render all question text as plain text with a tiny code/bold parser (no `v-html`, SE-6).

## Files

- `app/pages/exam/[attemptId]/index.vue`
- `app/components/exam/*`

## Acceptance criteria

- [ ] Whole exam usable keyboard-only.
- [ ] Works at 360 px width.
- [ ] Skip and return works.
