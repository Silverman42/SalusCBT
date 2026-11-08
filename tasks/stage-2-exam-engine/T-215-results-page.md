# T-215 · Results page

| | |
| --- | --- |
| Stage | 2 · Exam engine |
| Depends on | [T-208](T-208-review-queries.md) |
| Requirements | `EX-14`, `EX-15`, `EX-16` |
| Design refs | LLD §14.1 (`/result`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Instant result with domain breakdown after submit.

## Steps

- `ResultSummary`: scaled score, Pass / Below 750, "comfortable margin" ≥ 800, points, time used, flagged count.
- `DomainChart`: points and % per domain; highlight < 81%.
- Notice that history lives in this browser, with a link to export (risk mitigation).
- Share-link button placeholder (wired in T-504).

## Files

- `app/pages/exam/[attemptId]/result.vue`
- `app/components/review/ResultSummary.vue`
- `app/components/review/DomainChart.vue`

## Acceptance criteria

- [ ] Shown immediately after submit; no manual marking.
