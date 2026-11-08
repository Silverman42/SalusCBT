# X-03 · Weekly backups and observability

| | |
| --- | --- |
| Stage | X · Cross-cutting |
| Depends on | [T-110](../stage-1-setup/T-110-netlify-setup.md) |
| Requirements | — |
| Design refs | HLD §9 (Backups, Observability) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Don't lose data; know when things break.

## Steps

- Schedule weekly Convex snapshot exports stored outside Convex.
- Check Convex and Netlify function logs are reachable; note optional Sentry for later.

## Files

- (Convex dashboard / ops runbook)

## Acceptance criteria

- [ ] A restore from a snapshot has been tried once.
