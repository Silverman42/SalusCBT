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

- [ ] Closed or unknown codes show inline messages.
