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
- [ ] No CompTIA logos or "official" claims.

## Notes

- The source's candidate instructions mention a human proctor, a phone, and writing answers in the Part 3 sheet. Rewrite them for the app (built-in timer, answers saved automatically) rather than copying them word for word.
