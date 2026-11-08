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

- [x] Refresh mid-exam loses nothing and does not reset the timer. (Unit level: cache restores answers, the unsent queue and the clock offset; `deadline` comes from the server. Browser check comes with T-213/T-220.)
- [x] Going offline then online sends queued answers. (Unit level; the composable wires `online`/`offline`, the Convex socket state and `visibilitychange`/`pagehide`.)

## Tests

- `tests/unit/attemptSync.test.ts`: coalescing per question, 400 ms debounce, `clientUpdatedAt` ordering in server-clock ms, `applied: false` drop, retry/backoff and reset, send timeout, offline pause and reconnect flush, `ATTEMPT_CLOSED` read-only, `BAD_TOKEN` stop, `VALIDATION_FAILED` drop, refresh restore (answers, queue, in-flight saves, clock), blocked and full storage, merge rules (newer wins, tie to server, requeue, submitted = server wins).

## Notes

- Logic lives in `app/lib/attemptSync.ts` (`AttemptSync`, pure, injectable transport/clock/storage); `app/composables/useAttempt.ts` is a thin wrapper over `useNuxtApp().$convex`. No separate `useConvex.ts`: the composable uses `$convex` directly (T-403); add a shared `useConvex*` only when a second consumer needs one.
- Cache `localStorage["salus.attempt.<id>"] = { v: 1, responses, pending, clock?, savedAt }`. Never holds the anon token. Write failures fall back to memory (`persistent: false`); on a full store, other attempts' caches older than 24 h are evicted once. Removed once the attempt is submitted or expired.
- The queue is a set of question ids; each send carries the question's whole current state, so changes coalesce. One save in flight per question; a save that doesn't settle in 15 s is retried (the server's `clientUpdatedAt` check makes a late duplicate harmless).
- Errors: `ATTEMPT_CLOSED` → read-only; `BAD_TOKEN` → queue stops (changes kept); `NOT_FOUND`/`VALIDATION_FAILED` → that entry is dropped (kept locally, `saveError` set); anything else retries with backoff 1 s·2ⁿ ≤ 30 s, ±25 % jitter. Reconnecting skips the remaining backoff.
- Merge (`getState` is a live subscription): per question the newer `updatedAt` wins, a tie goes to the server, a local state the server lacks is requeued; `submitted`/`expired` → server wins outright.
- Clock: `recordAttemptStart(attemptId, serverNow, sentAt, receivedAt)` (for the start page, T-211) seeds the offset from `/api/attempts/start`; each save's `savedAt` refines it (smallest round trip wins, samples expire after 10 min). `getState.serverNow` is used only when nothing else is known, since a cached query result can be old.
- `submit({ force })` flushes first and throws `SavesPendingError` if answers are unsaved unless `force` (the timer at 0:00 forces). It calls `attempts:submit` by name via `makeFunctionReference` until T-207 lands; then switch to `api.attempts.submit`.

