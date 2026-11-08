# T-302 · PbqSshLog component (SSH brute-force alert)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-213](../stage-2-exam-engine/T-213-exam-runner-ui.md) |
| Requirements | `PB-1`, `PB-2`, `QA-2` |
| Design refs | LLD §14.4; PRD PBQ table row 1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Scrollable `auth.log` viewer with search and answer fields.

## Steps

- Virtualised log viewer (~120 lines), monospace.
- Search box with highlight and match count.
- Answer fields 1a–1c (IP, account, count) and practice field 1d (not scored).

## Files

- `app/components/pbq/PbqSshLog.vue`

## Acceptance criteria

- [x] Search works by keyboard; match count updates live.
- [x] Practice answer shown only in review. (Runner side: the paper carries no model answer and the component shows none; the 1d model answer itself is rendered by T-309.)

## Notes

- `app/components/pbq/PbqSshLog.vue`, after mockup screen 03: dark `auth.log` panel (file icon, title, line count, line numbers, search pill with the match-count badge) on the left; Scenario and 1a–1d on the right (`heading` slot first, `footer` last). Below `lg` the panels stack; the log scrolls inside itself (both axes), never the page (checked at 375 px).
- Not virtualised: the seed logs are 134 / 138 lines, so every line is rendered. That keeps browser find, selection and screen readers working on the whole log. Revisit only if a log grows past a few thousand lines.
- Search (`app/lib/pbq/sshLog.ts`): literal, case-insensitive, non-overlapping. Matching lines get the tinted row and `<mark>` highlights (mockup colours). Enter / Shift+Enter jump to the next / previous match (wrapping; the current match is outlined and scrolled into view; the badge shows `3/68`); Escape clears. An `aria-live="polite"` region announces "68 matches" / "3 of 68" / "No matches". Search stays usable when `readOnly` (for T-309 review).
- Inputs: labelled by `<label for>` with the part id and prompt; `inputmode` decimal (IP) / numeric (count); 1d is a textarea with the "Practice · not scored" pill. Typing emits `{ debounce: true }`; values are not trimmed client-side (marking normalises, LLD §8.1). `readOnly` disables every input.
- Tests: `tests/unit/pbq-sshlog.test.ts` (split, search segments, literal and non-overlapping matching, seed logs A and B, match stepping and labels).
