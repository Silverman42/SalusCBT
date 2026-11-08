# T-401 · EmailProvider interface, adapters and templates

| | |
| --- | --- |
| Stage | 4 · Admin and tutor sign-in |
| Depends on | [T-101](../stage-1-setup/T-101-scaffold-project.md) |
| Requirements | `AR-4`, `PR-2` |
| Design refs | LLD §11; HLD D7 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

All email goes through one swappable interface.

## Steps

- `email/provider.ts`: `EmailMessage`, `EmailProvider`, `getProvider()` switch on `EMAIL_PROVIDER`.
- `email/resend.ts` (uses `RESEND_API_KEY`, `EMAIL_FROM`) and `email/console.ts` (logs to Convex logs).
- `email/templates.ts`: `otp({ to, code })`, `invitation({ to, link, invitedBy })` — plain text + simple HTML, no tracking.
- Internal action `email.send` with 3 retries and backoff via the scheduler.

## Files

- `convex/email/provider.ts`
- `convex/email/resend.ts`
- `convex/email/console.ts`
- `convex/email/templates.ts`
- `convex/email/send.ts`

## Acceptance criteria

- [ ] Switching provider is one new file + one `case` + env change.
- [ ] Templates escape all inserted values.

## Tests

- Vitest for templates; convex-test with a fake provider for retries.
