# T-702 · Terminal lab: lexer, pipeline runner and terminal UI

| | |
| --- | --- |
| Stage | 7 · Terminal lab |
| Depends on | [T-701](T-701-lab-vfs-seed.md) |
| Requirements | `LB-1`, `LB-3` |
| Design refs | LLD §13.1 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Parse a command line and run pipes.

## Steps

- `lexer.ts`: words, `'…'` and `"…"`, split on `|`.
- `runner.ts`: each command gets stdin → `{ stdout, stderr, code }`.
- Unknown commands/flags print "not available in this lab".
- `Terminal.vue`: prompt in `~/secplus-lab`, history with ↑/↓, `clear`, `help`.

## Files

- `app/lib/terminal/lexer.ts`
- `app/lib/terminal/runner.ts`
- `app/components/lab/Terminal.vue`

## Acceptance criteria

- [ ] Pipes of 3+ commands work.
- [ ] Terminal is keyboard- and screen-reader-friendly.
