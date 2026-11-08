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

- `tests/convex/auth/gate.test.ts` (the gate story) and `tests/convex/auth/access.test.ts` (role sweep)
- `tests/e2e/auth.spec.ts`

## Acceptance criteria

- [x] **Stage 4 gate:** invited tutor registers and signs in by code; bad codes rejected; removed tutor is signed out. (convex-test, `gate.test.ts`; browser run pending, see Notes)

## Notes

- **Files.** The convex-test suites live next to the other auth tests in
  `tests/convex/auth/` rather than in one `tests/convex/auth.test.ts`.
  Detailed cases already covered there are not repeated: the 5-try lockout,
  the 10-minute edge, IP and email request limits, and the proxy secret are
  in `signIn.test.ts`; the session gate, audit and `endSessions` are in
  `profiles.test.ts`; invitation expiry, resend and cancel are in
  `invitations.test.ts`; admin-only access to `admin.*` is in `admin.test.ts`.
- **`gate.test.ts`** runs the whole Stage 4 story through the real
  `/api/auth/*` routes with the cookies they set, in this order:
  `ensureAdmin` (stubbed `ADMIN_EMAIL`), admin signs in by code, admin
  invites, the link is read from the scheduled email, `peek`, `accept` (and a
  second `accept` gets `NOT_FOUND`), wrong code (`INVALID_OTP`), right code
  (HttpOnly cookie, then `get-session`, then `/convex/token` JWT, then
  `profiles.me` and `classes.mine`; `admin.tutors` gets `FORBIDDEN`), same
  code reused (`INVALID_OTP`), a code used after more than 10 minutes
  (`OTP_EXPIRED`), admin `removeTutor`, then the old cookie, the old JWT
  and new tokens all stop working, a code requested before removal gets 403
  `ACCOUNT_INACTIVE` with no cookie, and a new request sends nothing. Last,
  the admin signs out, and the audit log holds the whole story. Convex calls
  use `withIdentity` with the JWT's `sub` and `sessionId`, because
  convex-test doesn't verify JWTs. A mutation check showed the test fails if
  `removeTutor` stops calling `endSessions`.
- **`access.test.ts`** finds every exported public query, mutation and
  action in `convex/` and requires each one to be classified as `public`,
  `tutor` or `admin`, so a new function can't go unclassified. It then calls
  each tutor and admin function with well-formed arguments. Signed out gets
  `UNAUTHENTICATED`; a session without a profile and a removed tutor get
  `FORBIDDEN`; a tutor calling an admin function gets `FORBIDDEN`. None of
  these calls writes anything.
- **`tests/e2e/auth.spec.ts`** (Playwright) is skipped unless `E2E_AUTH=1`.
  It needs a dev deployment with `ADMIN_EMAIL` and `SERVER_SECRET` set and
  `ensureAdmin` run, and it reads the console-provider emails by tailing
  `npx convex logs`. The setup commands are in the header of the spec. It
  has not been run live yet. Its last step, sign out, uses the header button
  on `/tutor`, so it also needs the tutor area from T-505.
- No product bugs found.
