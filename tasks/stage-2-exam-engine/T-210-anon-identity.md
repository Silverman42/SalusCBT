# T-210 · useAnonIdentity composable with export and import

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-101](../stage-1-setup/T-101-scaffold-project.md) |
| Requirements | `EX-19`, `EX-20`, `PR-1`, `SE-3` |
| Design refs | LLD §4; HLD D4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Give each browser a secret anonymous token, with a way to move it between devices.

## Steps

- Create a 32-byte `crypto.getRandomValues` token (base64url, 43 chars) on first visit.
- Store `localStorage['salus.anon.v1'] = { token, displayName?, createdAt }` in try/catch; fall back to a session-only token with a notice.
- `exportProgress()` → `salus-progress.json = { v: 1, token, displayName, exportedAt }`.
- `importProgress(file)` validates and replaces the token after confirmation.

## Files

- `app/composables/useAnonIdentity.ts`

## Acceptance criteria

- [x] Blocked storage still lets the student sit an exam.
- [x] Import of a malformed file is rejected with a message.

## Tests

- Vitest with mocked storage.

## Notes

- EX-20 is accepted: the export and import screens warn that the file contains the anonymous ID and must be kept private.
- Token size settled on 2026-11-08: 256-bit (32 bytes), as in LLD §4. PRD SE-3 now says the same.
- Done 2026-11-08. Pure logic lives in `app/lib/anonIdentity.ts` (no Nuxt/DOM); the composable is a thin `useState` wrapper, initialised on the client only (after mount while hydrating, so SSR markup matches; `token` is `null` until `ready`). Tested in `tests/unit/anonIdentity.test.ts`.
- Blocked storage: `getItem`/`setItem` throwing (or no `localStorage`) yields a usable in-memory token with `persistent: false`; the UI shows the notice from that flag. Verified at token level — the exam flow itself does not exist yet.
- `importProgress(file)` never changes state by itself: it returns `{ ok: false, error }` with a user-facing message, or a preview with `confirm()` that the caller runs after its own confirmation dialog. Limits: file ≤ 4 KB, `v === 1`, token `^[A-Za-z0-9_-]{43}$`, optional `displayName` string ≤ 40 chars.
- No UI here: the export/import screens and their "keep this file private" warnings (EX-20) belong to T-217 (history page).
