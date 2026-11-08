# T-407 · Sign-in and invitation pages

| | |
| --- | --- |
| Stage | 4 · Admin and tutor sign-in |
| Depends on | [T-403](T-403-auth-proxy-client.md), [T-405](T-405-invitations-backend.md) |
| Requirements | `AU-1`, `AU-2`, `AU-3` |
| Design refs | LLD §14.1 (`/sign-in`, `/invite/[token]`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Email-then-code screens for tutors and the admin.

## Steps

- `/sign-in`: email step always shows "If this email has an account, we've sent a code"; code step with 6-digit input, resend after 60 s.
- `/invite/[token]`: `peek` → read-only email → accept → send code → code entry → `/tutor`.
- Clear messages for expired/invalid codes and invitations; Sign out button in the header.

## Files

- `app/pages/sign-in.vue`
- `app/pages/invite/[token].vue`

## Acceptance criteria

- [ ] Page text never reveals whether an email is registered.
