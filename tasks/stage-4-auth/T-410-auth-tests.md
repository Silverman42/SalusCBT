# T-410 · Auth tests and Stage 4 gate

| | |
| --- | --- |
| Stage | 4 · Admin and tutor sign-in |
| Depends on | [T-407](T-407-sign-in-invite-pages.md), [T-408](T-408-admin-ui.md) |
| Requirements | `AU-1`, `AU-2`, `AU-3`, `AU-4`, `SE-2` |
| Design refs | LLD §17 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Prove sign-in is safe before tutors use it.

## Steps

- convex-test: wrong/expired/reused codes; 5-try lockout; request limits; removed tutor; every tutor/admin function refuses anon and wrong role.
- Playwright with the console provider: invite → accept → OTP → signed in; sign out.

## Files

- `tests/convex/auth.test.ts`
- `tests/e2e/auth.spec.ts`

## Acceptance criteria

- [ ] **Stage 4 gate:** invited tutor registers and signs in by code; bad codes rejected; removed tutor is signed out.
