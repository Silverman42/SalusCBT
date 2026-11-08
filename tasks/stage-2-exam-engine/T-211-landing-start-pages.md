# T-211 · Landing page and start/instructions screen

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-203](T-203-start-route.md), [T-210](T-210-anon-identity.md) |
| Requirements | `EX-1`, `EX-2`, `QA-5` |
| Design refs | LLD §14.1 (`/`, `/start`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

One click to a running exam, in under 30 seconds, with no account.

## Steps

- `/` (SSR): "Start mock exam", "Retake PBQs" (hidden until T-307), lab link; "Security+ style practice exam" wording.
- `/start`: instructions from the file's candidate instructions; optional display name and class code (class lookup added in T-508).
- Start button posts to `/api/attempts/start` and routes to `/exam/[attemptId]`.
- Friendly messages for `RATE_LIMITED`, `CLASS_CLOSED`, `CLASS_UNKNOWN`.

## Files

- `app/pages/index.vue`
- `app/pages/start.vue`

## Acceptance criteria

- [ ] From landing to first question in < 30 s on broadband.
- [x] No CompTIA logos or "official" claims.

## Notes

- The source's candidate instructions mention a human proctor, a phone, and writing answers in the Part 3 sheet. Rewrite them for the app (built-in timer, answers saved automatically) rather than copying them word for word.
- Done 2026-11-08 (with T-508). `/` (SSR) follows mockup screen 01: hero, "90 min / 102 points / 750 to pass" chips (on the hero art; shown as a row under 1024 px), a form with display name and class code, "Start mock exam" and a "Practice lab" link, the last-attempt badge ("814 · Pass · View history") and "Resume your exam" for a running attempt (`review.myAttempts`, client only), and a "How scoring works" section at `/#scoring` for the header link. "Retake (set B)" is left out until T-307.
- The landing form remembers the display name and goes to `/start?class=…`. `/start` shows the rewritten instructions (`app/components/start/Instructions.vue`: built-in timer, time calls, pacing alerts, flagging, scoring, autosave, submitting is final), the same fields and "Start the exam". Start posts to `/api/attempts/start`, calls `recordAttemptStart` with `sentAt`/`receivedAt`, then opens `/exam/[attemptId]`; the button stays busy until navigation, so it can't start twice. Error codes map to messages in `app/lib/start.ts` (`RATE_LIMITED` with the wait, `CLASS_*` on the class field, `VALIDATION_FAILED` on the name field, network failure). The "this browser can't save progress" notice shows when storage is blocked.
- Verified in `nuxt dev`: `/` and `/start` render at 1280 px and 375 px (no horizontal scroll), light and dark, no console errors; Start without `NUXT_SERVER_SECRET` shows "We couldn't start the exam just now…" (500 `SERVER_ERROR`). The < 30 s criterion is not measured yet: it needs a dev server with the secret set (T-220 e2e).
- `/start` is SSR'd (LLD §14.1 says client); the identity-dependent parts wait for `ready` or sit in `<ClientOnly>`, so it hydrates cleanly. Adding `"/start": { ssr: false }` to `nuxt.config.ts` is optional.
