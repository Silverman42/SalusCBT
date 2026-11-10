# T-409 · Resend domain setup for salus.fibreware.dev

| | |
| --- | --- |
| Stage | 4 · Admin and tutor sign-in |
| Depends on | [T-401](T-401-email-provider.md) |
| Requirements | `AR-4` |
| Design refs | LLD §11 (Domain setup); HLD §10 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Production email from a verified domain so codes don't land in spam.

## Steps

- Add `salus.fibreware.dev` in Resend.
- Add DKIM `TXT`, `send.` subdomain `MX` and SPF `TXT`, and DMARC `TXT` at the DNS host for `fibreware.dev`.
- Set `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `EMAIL_FROM` in Convex production.

## Files

- (DNS + Resend dashboard)

## Acceptance criteria

- [x] Resend shows the domain verified.
- [ ] A test OTP reaches Gmail and Outlook inboxes, not spam.

## Notes

- Ops task; only production waits on DNS. Dev and preview use the console provider.

- **2026-11-10:** production sends from `no-reply@salus.fibreware.dev` (Convex prod `perfect-shrimp-573`); `email/test:sendTest` delivered to the Gmail inbox. Outlook not checked yet; DMARC record (`_dmarc.salus`) still to add.
