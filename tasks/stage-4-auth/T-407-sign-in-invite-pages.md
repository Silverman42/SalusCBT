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

- [x] Page text never reveals whether an email is registered.

## Notes

- Screens follow mockup screen 08 ("Staff sign in"): brand panel on the left (lg and up only),
  form column on the right; six code boxes, pill "Sign in", "Resend code in 0:42" countdown and
  "Use a different email". The email step and the invitation states have no mockup; they reuse the
  same shell, icon tile, heading and copy tone.
- Shared pieces: `app/components/auth/AuthShell.vue` (frame), `AuthCodeForm.vue` (code entry,
  verify, resend after 60 s, auto-submit on six digits), `AuthSignOutButton.vue` (shown in
  `AppHeader` on `/tutor/**` and `/admin/**`; the header's "Staff sign in" link is hidden on
  `/sign-in` and `/invite/**`).
- Pure logic in `app/lib/signIn.ts`, tested in `tests/unit/signIn.test.ts` (18 tests): code
  sanitising (digits only, full-width digits, max 6), `X-Retry-After` parsing and wording, error
  code → message mapping (`INVALID_OTP`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS`, `ACCOUNT_INACTIVE`,
  429), a check that no message hints at whether an account exists, and the post-sign-in path
  (`safeRedirectPath`, role home, no loop back to `/sign-in` or `/invite`).
- Every code request shows "If <email> belongs to an active account, we've sent a 6-digit code";
  only a 429 (per IP, not per email) or a malformed request shows an error. An unknown email's
  code check answers `INVALID_OTP` like any wrong code.
- `useAuth().sendCode` / `verifyCode` now also return `retryAfterS` (from Better Auth's
  `X-Retry-After` header) so the UI can say when to retry.
- `/invite/[token]`: `peek` → read-only email → "Accept and send code" (`accept`, then `sendCode`
  to the email `accept` returns) → code entry → `/tutor`. `{ valid: false }` and `NOT_FOUND` show
  the same "This invitation link doesn't work" screen, with a link to sign in (a reload after
  accepting lands there, since the link is single-use).
- Added `"/invite/**": { ssr: false }` to `routeRules` (LLD §14.1 lists the route as client).
- Accessibility: labelled inputs, `aria-live` error and notice regions, `aria-invalid` +
  `aria-describedby`, focus moves to the email/code input or the invite heading;
  `autocomplete="one-time-code"` + `inputmode="numeric"` on one real input under the six display
  boxes.
- Live check (Nuxt dev on :3400 against the dev deployment): `/sign-in` and `/invite/bogus`
  render; an unknown email gets the neutral message; a wrong code shows "That code isn't right";
  a second request within 60 s shows "Too many code requests. Try again in 12 seconds."; no
  horizontal scroll at 375 px; light and dark checked.
