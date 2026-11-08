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

- [x] Whole exam usable keyboard-only. (Native radios/checkboxes and buttons; A–E / 1–5 choose an option; ← → previous/next outside form fields; navigator is one tab stop with arrow keys, Home/End, Ctrl+Home/End; focus moves to the question heading on every change. Checked in a mocked-paper preview; full browser pass with a real attempt in T-220.)
- [x] Works at 360 px width. (No horizontal page scroll at 375 px on MCQ, each PBQ template, firewall and review, light and dark; long artefacts scroll inside their own panel.)
- [x] Skip and return works. (Next/Previous, navigator jumps and review-list jumps; unanswered and flagged questions listed before submit.)

## Tests

- `tests/unit/examRunner.test.ts`: question state (blank = unanswered, PBQ partial ignoring practice parts, portPair needs both ports, firewall rule needs port and action), navigator cell precedence and P1–P5 labels, summary counts, pre-submit review list (paper order, flagged / unanswered / flagged-unanswered / partly answered), Choose TWO enforcement (third pick refused), key → option mapping, PBQ part and firewall cell edits (blank → `null`), Next labels, grid movement, clock format, inline parser (code, bold, masked `****4417`, stray markers, no HTML).

## Notes

- Page `app/pages/exam/[attemptId]/index.vue` (no layout; its own header). `nuxt.config.ts` gains `routeRules["/exam/**"] = { ssr: false }` (LLD §14.1: client only; the result and review pages under it are client too).
- Components (`app/components/exam/`): `RunnerHeader` (slots `status`, `timer`), `SaveStatus` (polite live region; "Saving…" only after 600 ms), `QuestionMcq` (`choose(index)` exposed for shortcuts), `QuestionFooter`, `FlagButton` (`aria-pressed`, stable label), `Navigator`, `ReviewSubmit`, `QuestionPbq` (template → component map), `InlineText` (SE-6 parser). Pure logic in `app/lib/examRunner.ts`.
- PBQs: every template renders through `app/components/pbq/PbqGeneric.vue` (artefacts as `<pre>`, inputs per part kind, firewall rule table with native selects). T-302–T-306 add the dedicated components and change one entry in `QuestionPbq.vue`'s map. Contract (also in that file): props `question` (`AttemptPaperPbq`), `modelValue` (`AnswerValue | undefined`), `readOnly`; emit `update:modelValue(value | null, { debounce? })` (`debounce: true` for typing); slots `heading` (first in the answer panel; the runner focuses it) and `footer` (last).
- Timer: simple `formatClock(remainingMs)` pill in the header's `timer` slot (warn colour under 10 min). T-214 swaps in `<ExamTimer>` (auto-submit at 0:00) and puts `<ExamPacingBanner>` where the page comment marks it.
- Submit: review screen is the confirmation (mockup 05). `SavesPendingError` shows "N answers are still saving" with Try again / Submit anyway (`force`). `ATTEMPT_CLOSED` goes to the result. Success → `/exam/[attemptId]/result` (T-215).
- Closed attempt (submitted, expired, or a save got `ATTEMPT_CLOSED`): inputs disabled, banner with "See your result"; review screen shows "Exam submitted".
- The open question index is kept in `sessionStorage` per attempt so a refresh returns to it.
- Contrast: small text on `warn-soft` / `bad-soft` is below AA in light mode (4.39 / 3.95), so labels there use `text-fg` and only the large numbers are tinted; flagged navigator cells use `bg-warn text-canvas` as in the mockup.
- Radii are explicit px (`rounded-[24px]`): with `--ui-radius: 1rem` Nuxt UI scales `rounded-xl` to 3 rem, `rounded-3xl` to 6 rem.
- Deviations from the mockup: no domain chip on the question (the paper has no domain); PBQ screens show the navigator below the question; the timer is the simple display above.
