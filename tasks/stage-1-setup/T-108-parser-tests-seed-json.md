# T-108 · Parser tests and committed seed JSON

| | |
| --- | --- |
| Stage | 1 · Setup |
| Depends on | [T-107](T-107-exam-parser.md) |
| Requirements | `AR-1` |
| Design refs | LLD §17 (Parser row) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Lock the parser's behaviour with tests and commit its output.

## Steps

- Tests for counts, Choose TWO detection, key coverage, domain totals = 102.
- Test normalisation of every Part 6 answer.
- Snapshot test of `content/seed/sy0-701.json`.
- Negative tests: a broken fixture produces errors with line numbers.
- Generate and commit `content/seed/sy0-701.json`.

## Files

- `tests/unit/parser.test.ts`
- `tests/fixtures/*.md`
- `content/seed/sy0-701.json`

## Acceptance criteria

- [ ] All parser tests pass in CI.
- [ ] Seed JSON committed and matches snapshot.
