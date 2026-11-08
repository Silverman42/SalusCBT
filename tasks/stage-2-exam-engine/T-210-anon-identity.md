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

- [ ] Blocked storage still lets the student sit an exam.
- [ ] Import of a malformed file is rejected with a message.

## Tests

- Vitest with mocked storage.

## Notes

- EX-20 is accepted: the export and import screens warn that the file contains the anonymous ID and must be kept private.
- Token size settled on 2026-11-08: 256-bit (32 bytes), as in LLD §4. PRD SE-3 now says the same.
