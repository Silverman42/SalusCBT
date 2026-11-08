# T-212 · Exam runner state: useAttempt, local cache and save queue

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-205](T-205-attempts-paper-state.md), [T-206](T-206-attempts-save.md) |
| Requirements | `EX-11` |
| Design refs | LLD §7.2 (client side), §14.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Keep answers safe through refreshes and dropped connections.

## Steps

- Load `paper` once; merge local cache with `getState` (server wins once submitted).
- `clockOffset = serverNow − Date.now()`; remaining time from `deadline`.
- Every change → `localStorage['salus.attempt.<id>']` first, then `saveResponse`.
- Queue failed saves; retry with backoff; flush on reconnect and before submit.
- Debounce text input 400 ms; send clicks immediately.

## Files

- `app/composables/useAttempt.ts`
- `app/composables/useConvex.ts`

## Acceptance criteria

- [ ] Refresh mid-exam loses nothing and does not reset the timer.
- [ ] Going offline then online sends queued answers.
