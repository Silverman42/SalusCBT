# X-04 · MVP release (Stages 1–4)

| | |
| --- | --- |
| Stage | X · Cross-cutting |
| Depends on | [T-220](../stage-2-exam-engine/T-220-e2e-full-sitting.md), [T-309](../stage-3-pbqs/T-309-pbq-review-and-e2e.md), [T-410](../stage-4-auth/T-410-auth-tests.md), [T-409](../stage-4-auth/T-409-resend-domain.md), [X-01](X-01-cross-browser-qa.md), [X-02](X-02-performance-check.md) |
| Requirements | — |
| Design refs | PRD Scope, Release plan |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Ship the MVP to production.

## Steps

- Confirm all Stage 1–4 gates are ticked in the tracker.
- Production env vars set; `EMAIL_PROVIDER=resend`.
- Admin signs in on production; one tutor invited end to end.
- Announce the link to the first class.

## Acceptance criteria

- [ ] Students can sit a full mock on production; tutors can sign in.
