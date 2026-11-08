# T-508 · Class code and display name on the start screen

| | |
| --- | --- |
| Stage | 5 · Classes |
| Depends on | [T-501](T-501-classes-backend.md), [T-211](../stage-2-exam-engine/T-211-landing-start-pages.md) |
| Requirements | `CL-4`, `PR-1` |
| Design refs | LLD §7.1 step 4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Students join a class before starting.

## Steps

- On `/start`, look up the code as it's typed (`classes.lookupCode`) and show the class name or an inline error.
- Display name becomes required (1–40 chars) when a code is entered.
- Support `/start?class=SEC-XXXX` links.

## Files

- `app/pages/start.vue`

## Acceptance criteria

- [x] Closed or unknown codes show inline messages.

## Notes

- Done 2026-11-08 (code in the T-211 commit, since the landing form and `/start` share `app/components/start/DetailsFields.vue`). The code is normalised as typed (`4k7q`, `sec4k7q` → `SEC-4K7Q`, `app/lib/start.ts`), looked up with `classes.lookupCode` 300 ms after it is complete (cached, stale answers dropped) and the field shows "Joining <class>", "Class not found…", "<class> is closed…", or a format hint, in an `aria-live` region linked by `aria-describedby`. With a code the display name is required (1–40); the start route's `CLASS_UNKNOWN` / `CLASS_CLOSED` / `VALIDATION_FAILED` land on the matching field. `/start?class=SEC-XXXX` pre-fills the code.
- Verified live: `/start?class=sec-zzzz` shows "Class not found"; Start then focuses the display name with "Enter a display name…". The closed message is covered by unit tests only (no closed class on the dev deployment).
- EX-21: `lookupCode` doesn't return the class's `timeMultiplier`, so the instructions always say 90 minutes. `StartInstructions` takes a `minutes` prop ready for it.
