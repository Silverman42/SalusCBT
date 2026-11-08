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

- [x] Switching provider is one new file + one `case` + env change.
- [x] Templates escape all inserted values.

## Tests

- Vitest for templates; convex-test with a fake provider for retries.

## Notes

- **Function reference** is `internal.email.send.send` (file `convex/email/send.ts`, export `send`), not `internal.email.send` as the LLD §9.1 sketch writes it. Callers pass a template result: `ctx.runAction(internal.email.send.send, templates.otp({ to, code }))`.
- **Delivery:** the first attempt runs inline. A retryable failure (network error, 429, 5xx) is logged and rescheduled after 5 s, 30 s and 120 s (`RETRY_DELAYS_MS`, kept short because an OTP lasts 10 minutes); after 3 retries it logs `failed permanently`. Other 4xx and missing config are permanent and not retried. The action returns `{ status: "sent" | "retrying" | "failed" }` and never throws for a delivery failure, so the caller's silent sign-in response is unaffected. All attempts share one `Idempotency-Key` (Resend de-duplicates a retry after a timed-out-but-delivered request).
- **Env:** `EMAIL_PROVIDER` unset → `console` (LLD §11 default; local dev and deploy previews). An unknown value throws rather than falling back, so a typo in production can't write OTP codes to the logs. `resend` requires `RESEND_API_KEY` and `EMAIL_FROM`.
- **Env typing:** the Convex guidelines want env vars declared in `convex/convex.config.ts` (`defineApp({ env })`) and read through `env` from `_generated/server`. `provider.ts` reads that `env` (it is `process.env` at runtime) cast to a record, because declaring the three variables needs a `convex.config.ts` change outside this task's files. Follow-up: declare `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` as `v.optional(v.string())` there and drop the cast.
- **Resend** is called with plain `fetch` (no SDK, no `"use node"`). Error logs keep only the status, never the response body, recipient or content (PR-2). Only the console provider logs content, by design.
- **Templates:** fixed subjects; every inserted value HTML-escaped (`& < > " '`); the invitation link must be an absolute http(s) URL (blocks `javascript:`/`data:`); recipients with whitespace or control characters are rejected. No images or links other than the invitation link.
- **Tests:** `tests/unit/email/templates.test.ts` (escaping, URL checks, no tracking), `tests/convex/email/send.test.ts` (provider switch, Resend request shape, retries/backoff/idempotency key, permanent failure, network error, no PII in logs, console path) with a stubbed `fetch` and env.

