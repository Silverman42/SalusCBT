# T-309 · PBQ review rendering and E2E tests

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-307](T-307-retake-mode.md), [T-216](../stage-2-exam-engine/T-216-review-page.md) |
| Requirements | `EX-17`, `PB-2`, `QA-2` |
| Design refs | LLD §8.3, §17 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Review shows per-part results for PBQs, and the full flow is tested.

## Steps

- `ReviewItem` PBQ variants: per-part your answer / correct / ✓✗; firewall per rule; 1d model answer.
- Playwright: standard sitting with PBQs answered; retake sitting.
- axe checks on all five PBQ components.

## Files

- `app/components/review/ReviewItem.vue`
- `tests/e2e/pbq.spec.ts`

## Acceptance criteria

- [ ] No serious axe violations on PBQs.
