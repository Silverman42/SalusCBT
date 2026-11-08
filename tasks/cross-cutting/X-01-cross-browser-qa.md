# X-01 · Cross-browser, phone-width and accessibility pass

| | |
| --- | --- |
| Stage | X · Cross-cutting |
| Depends on | [T-309](../stage-3-pbqs/T-309-pbq-review-and-e2e.md) |
| Requirements | `QA-1`, `QA-2`, `QA-4` |
| Design refs | HLD §9 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

MVP release check across browsers and devices.

## Steps

- Full sitting on current Chrome, Edge, Safari and Firefox.
  360 px width: exam runner, navigator, all five PBQs.
- Keyboard-only full sitting; screen reader spot check; dark and light themes.

## Files

- `tests/e2e/playwright.config.ts (projects)`

## Acceptance criteria

- [ ] No blocking issues on any target browser.
- [ ] WCAG 2.2 AA target met on exam screens.
