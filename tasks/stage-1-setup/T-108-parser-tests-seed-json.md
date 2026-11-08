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

- [x] All parser tests pass in CI.
- [x] Seed JSON committed and matches snapshot.

## Notes

- Counts, Choose TWO detection, key coverage, domain totals = 102, Part 6 normalisation and in-source negative cases were already covered by T-107's `tests/unit/parser.test.ts`. T-108 adds `tests/unit/seed-json.test.ts` instead of duplicating them.
- "Snapshot" is a deep-equal of the committed `content/seed/sy0-701.json` against a fresh `parseExam` of the source and against the CLI's stdout. Editing the source without regenerating fails CI. Regenerate with `npm run seed:json` (`tsx` pinned as a devDependency; the output is run through Prettier so `format:check` stays meaningful).
- `tests/fixtures/broken-exam.md` is a small broken exam: the CLI exits 1, prints nothing on stdout and reports `file:line: message` on stderr. The usage exit (2) is tested too.
- SE-1: the seed holds answer keys. The ESLint `no-restricted-imports` rule for `app/**` now also blocks `**/content/seed/**` and `**/sy0-701.json`. The seed is not under `public/` and not in Nitro `serverAssets`; a test checks `nuxt.config.ts` never references it.
- `seed:json` redirects stdout straight into the seed file, so a failed parse leaves it empty. The drift test then fails; restore the file from git.
