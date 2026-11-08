# T-704 · Lab commands: grep, awk, cut, sort, uniq, wc, sed

| | |
| --- | --- |
| Stage | 7 · Terminal lab |
| Depends on | [T-702](T-702-lab-lexer-runner.md) |
| Requirements | `LB-2` |
| Design refs | LLD §13.2 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Text-processing commands for Lab A and C.

## Steps

- `grep` with `-c -i -n -v -o`.
- `awk '{print $N}'`, `$NF`, `$(NF-k)`, optional `-F`.
- `cut`, `sort -n -r`, `uniq -c`, `wc -l`.
- `sed -i 's/…/…/[g]'` only.

## Files

- `app/lib/terminal/commands/*.ts`

## Acceptance criteria

- [ ] Lab A pipeline yields `185.220.101.47`, `backup`, `50`.
