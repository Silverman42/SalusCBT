# T-217 · History page with export and import

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-208](T-208-review-queries.md), [T-210](T-210-anon-identity.md) |
| Requirements | `EX-19`, `EX-20` |
| Design refs | LLD §14.1 (`/history`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Students see past attempts and can move them to another device.

## Steps

- List from `review.myAttempts`: date, score, pass/fail; link to result and review.
- Export / Import buttons using `useAnonIdentity`, with a warning that the file is a secret.

## Files

- `app/pages/history.vue`

## Acceptance criteria

- [ ] Import on a second browser shows the same history. (The import replaces the token after the confirm dialog and the list reloads from `review.myAttempts` for the new token, which is the whole mechanism: checked live with a made-up ID (empty history, then the original ID restored). Not yet checked with real attempts on two browsers; needs the start flow / T-220.)

## Tests

- `tests/unit/history.test.ts`: row formatting (pass, "Below 750" retake, in progress → Resume, past deadline → "Time's up" / Open, expired → no links), pager (append, de-duplicate across pages, cursor, `isDone`, no load while loading or after an error), load error messages, import confirmation text (name and export date, bad dates ignored), import error texts.

## Notes

- Route `/history`, client only: `nuxt.config.ts` gains `routeRules["/history"] = { ssr: false }` (the token is in localStorage; LLD §14.1 says client).
- `app/composables/useAttemptHistory.ts` pages through `myAttempts` (20 per page, "Show older attempts"), restarts when the token changes and ignores answers for an old token. Rows (`app/components/history/AttemptRow.vue`, pure formatting in `app/lib/history.ts`) link to result and review, or to the runner to resume an in-progress attempt. `HistoryRecent` is the "Attempt history" card on the result page (last 3, "See all").
- Export / Import use `useAnonIdentity`. The EX-20 warning (the file holds the anonymous ID; keep it private like a password) sits right above the buttons, with the same wording as `/privacy`; button labels match the privacy page ("Export progress", "Import progress"). A valid file opens `AdminConfirmDialog` ("Replace this browser's progress?", explains that the current history will be hidden and to export first); invalid files show the `IMPORT_ERRORS` text; a file with the same ID says there is nothing to import.
- "This browser can't save progress" notice when `persistent` is false.
- `myAttempts` has no pass mark, so the fail badge says "Below 750" (`DEFAULT_PASS_SCALED`). Small badge and warning text use `text-fg` on the soft colours (tinted text there is under AA in light mode); the icon carries the colour.
- No history link in the site header yet (AppHeader is outside this task); the page is reached from the result page and the not-found states.
