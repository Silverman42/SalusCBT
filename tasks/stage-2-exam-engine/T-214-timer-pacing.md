# T-214 · Timer, time calls and pacing alerts

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-212](T-212-useAttempt.md) |
| Requirements | `EX-3`, `EX-4`, `EX-5`, `EX-21` |
| Design refs | LLD §14.3 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Always-visible countdown and the proctor guide's pacing nudges.

## Steps

- `Timer` component from `useAttempt` remaining time; submit at 0:00.
- `app/lib/pacing.ts`: checkpoints at 25/45/65/80 min elapsed (× multiplier) with the LLD conditions; time calls at 45/15/5 min remaining.
- `PacingBanner`: each shows once, dismissible, announced to screen readers.

## Files

- `app/lib/pacing.ts`
- `app/components/exam/Timer.vue`
- `app/components/exam/PacingBanner.vue`
- `app/composables/useExamTimer.ts`

## Acceptance criteria

- [x] At 0:00 the attempt submits; if that fails the result page still loads after auto-submit.

## Tests

- Vitest for `pacing.ts` with each condition true/false and multiplier 1 and 1.5.

## Notes

- `app/lib/pacing.ts` (pure, `tests/unit/pacing.test.ts`): checkpoints, conditions, `stepPacing`, storage parsing and the 0:00 state machine `timeUpStep`. `app/composables/useExamTimer.ts` wires them to `useAttempt` (clock, `sessionStorage`, submit, redirect). The runner page uses `<ExamTimer>` in the header's `timer` slot and `<ExamPacingBanner>` above the question.
- Scaling (EX-21): pacing checkpoints scale by the attempt's real duration, `(deadline − startedAt) / 90 min`, which already includes the class multiplier; at 1.5× they fall at 37.5 / 67.5 / 97.5 / 120 min. Banner text scales too ("about 90 seconds per question", "the last 15 minutes"). Time calls stay at 45 / 15 / 5 minutes *remaining* (EX-4), and a call longer than the attempt is left out.
- Conditions are evaluated once, when the checkpoint is reached. "Behind Qn" uses the highest answered MCQ `displayNumber`, with the target capped at the paper's last MCQ; a paper without MCQs (PBQ retake) gets no MCQ alerts.
- Once per attempt: handled ids and the active banners (text fixed when fired) are kept in `sessionStorage` under `salus.pacing.<attemptId>`, so a refresh neither repeats nor loses them. If the page was closed past several checkpoints, only the latest of each group (pacing, time call) is evaluated; the others are marked done silently. A new alert replaces the active one of its group, so at most two banners show (as at 45:00 at 1×: "You're behind…" plus the time call, whose detail matches the mockup: "You're on Q42. Aim to reach Q60 by 1:05 elapsed.").
- Accessibility: the clock is `role="timer"` (not live) with a minute-level label; calls, alerts and the 0:00 messages go to one assertive live region in `<ExamTimer>`, set once per firing (cleared after 10 s). Banners aren't live regions, so nothing is read twice. Dismissing returns focus to the question heading. Motion only behind `motion-safe:`.
- 0:00: `submit({ force: true })`; inputs go read-only at once. Success or `ATTEMPT_CLOSED` → result. An error, or no answer within 8 s (offline: the Convex client queues the mutation), shows "Time is up. We couldn't reach the server, so it will submit your exam automatically…" and retries every 15 s; `getState` turning `submitted`/`expired` (server `autoSubmit` at deadline + 30 s, or the sweep) redirects to the result. The redirect on a closed status also applies at any other time (another tab, a reopened submitted attempt), as T-213 asked.
- Live check: temporary client-only preview page (fake `useAttempt` with a controllable clock, deleted before commit) on port 3800: banners at 45:00 (light/mobile and dark/desktop), announcement text, no repeat after reload, 0:00 with a failing and with a hanging submit (→ waiting → redirect once status is `submitted`). The real runner page was loaded to confirm it builds; it can't run without a Convex backend in the worktree.
- Deviations: no "hide the timer" option (not in the mockup or LLD). Banner tone: time calls and the 80-minute alert use the mockup's brand-soft style; "behind" / PBQ alerts use warn-soft with `text-fg` labels (contrast note from T-213).
