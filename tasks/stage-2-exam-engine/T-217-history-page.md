# T-217 · History page with export and import

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-208](T-208-review-queries.md), [T-210](T-210-anon-identity.md) |
| Requirements | `EX-19`, `EX-20` |
| Design refs | LLD §14.1 (`/history`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Students see past attempts and can move them to another device.

## Steps

- List from `review.myAttempts`: date, score, pass/fail; link to result and review.
- Export / Import buttons using `useAnonIdentity`, with a warning that the file is a secret.

## Files

- `app/pages/history.vue`

## Acceptance criteria

- [ ] Import on a second browser shows the same history.
