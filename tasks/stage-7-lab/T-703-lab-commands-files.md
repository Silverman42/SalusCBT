# T-703 · Lab commands: cd, ls, cat, head, tail, stat, chmod

| | |
| --- | --- |
| Stage | 7 · Terminal lab |
| Depends on | [T-702](T-702-lab-lexer-runner.md) |
| Requirements | `LB-2` |
| Design refs | LLD §13.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

File navigation and viewing commands.

## Steps

- `cd`, `ls -l` / `ls -la` (format from §13.2), `cat`, `head`, `tail`.
- `stat -c '%a %n'`; `chmod` with 3–4 octal digits.

## Files

- `app/lib/terminal/commands/*.ts`

## Acceptance criteria

- [ ] Output matches fixtures.
