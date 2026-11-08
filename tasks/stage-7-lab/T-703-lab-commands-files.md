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

## Notes

- New modules in `app/lib/terminal/commands/`: `ls.ts`, `cat.ts`, `headTail.ts` (`head`, `tail`), `stat.ts`, `chmod.ts`, shared helpers in `fileUtil.ts`; listed in `DEFAULT_COMMANDS`. `cd` (and `pwd`) were already builtins from T-702; only tests were added here.
- `ls`: `-l -a -A -d -h -1 -C -r -t -S` (+ `--all`, `--almost-all`, `--directory`, `--human-readable`, `--reverse`). File operands first, then each directory with a `dir:` header when there is more than one operand; `total` in 1 KiB ext4 blocks; link counts 1 for files, 2 + subdirectories for directories; `-h` rounds up like GNU (`2.1M`). On the screen plain `ls` prints GNU's column layout (80 wide or `$COLUMNS`); into a pipe or file, one name per line. For that, `Output` got an optional `isTerminal` flag, set by `TerminalOutput.stream()` (`io.ts`, two lines). Missing operands: `ls: cannot access 'x': No such file or directory`, status 2.
- `cat`: `-n -b -s -E -T -A`; numbering runs on across files; with no flags the stored bytes are copied (binaries stay intact).
- `head` / `tail`: `-n N`, `-N`, `-c N`, `--lines`, `--bytes`, size suffixes (`2K`, `1MiB`), `head -n -N`, `tail -n +N` / `-c +N`, `-q`, `-v`, `==> f <==` headers. `tail -f` / `-F` / `--follow` → "not available in this lab" (status 2).
- `stat`: the default GNU report (device and inode numbers are made up, all four times are the stored mtime) and `-c` / `--format` / `--printf` with `%a %A %b %B %d %D %f %F %g %G %h %i %m %n %N %o %s %t %T %u %U %w %W %x %X %y %Y %z %Z %%`, flags, width and precision (`%04a`, `%-10s`, `%.3A`). Missing file: `stat: cannot statx 'x': …` (coreutils 9.x).
- `chmod`: octal (1–4 significant digits; a directory keeps setuid/setgid under fewer than five digits, as in GNU) and symbolic modes following GNU's `modechange.c` (`u+x`, `go-w`, `a=r`, `u=rw,go=`, `+x`, `g=u`, `X`, `s`, `t`; no-who clauses use umask 022, with GNU's `new permissions are …, not …` warning). `-R -v -c -f`; `-w`-style modes may be written as options. mtime is unchanged.
- Locale: output targets GNU coreutils in the **C locale**, UTC, ext4: names sort by byte order (the same order as the VFS and globs), messages use ASCII quotes. For the seeded lab tree `en_US.UTF-8` sorts the same, so the lab steps print identically; a UTF-8 locale would use curly quotes in `quote()` messages (`invalid mode: ‘x’`). The `ls -l` date is always `%b %e %H:%M` (GNU shows the year for files over six months old; a freshly built lab never has those).
- Tests: `tests/unit/terminal-files.test.ts` (the lab-step outputs on `seedLab()`, edge cases per command, and a comparison of ~70 command lines with GNU coreutils on a real `build-lab.sh` run with mtimes set to `LAB_MTIME`, `LC_ALL=C`, `TZ=UTC`). The comparison is skipped where `ls` is not GNU (macOS), so it has only run on CI. `ls -C` is not compared (GNU may pad columns with tabs).
- Not done: `ls -R`, `-i`, `--color`, quoting of odd names in `ls` output; the lab files have none. The criterion stays open until the T-707 fixtures (or the CI comparison) confirm it.
- `cat ~/secplus-lab/.answer-lab-b` (Lab B step) prints `No such file or directory` because `seedLab()` leaves that file out on purpose; T-706 should decide how that step behaves.
