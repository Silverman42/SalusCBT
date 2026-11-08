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

- [x] Lab A pipeline yields `185.220.101.47`, `backup`, `50`.

## Notes

- One module per command in `app/lib/terminal/commands/` (`grep.ts`, `awk.ts`, `cut.ts`, `sort.ts`, `uniq.ts`, `wc.ts`, `sed.ts`), plus `regex.ts` (the regex engine) and `textUtil.ts` (an option parser that keeps repeated values such as `sort -k1 -k2` and `grep -e a -e b`, line splitting, binary detection). Registered in `DEFAULT_COMMANDS`.
- Tests: `tests/unit/terminal-text.test.ts` runs every grep/awk/sort/uniq/wc/sed line from the Lab A and Lab C steps in `shared/lab.ts` on `seedLab()` and checks the exact output, the LB-4 answers (`185.220.101.47`, `backup`, `50`) and the sed fix (content and mode). Lab A is also checked against a plain-JS oracle over the script's `auth.log`. It then covers each tool's flags, edge cases and messages. Where GNU grep, sed and coreutils exist (CI on ubuntu-latest) it builds the lab with the real `build-lab.sh` and compares stdout and status with the real tools (`LC_ALL=C`) for the lab lines plus extra pipelines. That test is skipped on macOS (BSD tools) and has not run yet. `tests/unit/terminal-regex.test.ts` covers the engine.
- **Regex safety:** student patterns never reach the browser's backtracking `RegExp`. `regex.ts` parses GNU BRE (`\|`, `\+`, `\?`, `\{m,n\}`, `\<`, `\>`, `\b`, `\w`, `\s`, `[[:class:]]`) and ERE, compiles to an NFA program and runs a Pike VM: O(text × program) per search. The program is capped at 40,000 instructions (`(a{1000}){1000}` gives glibc's `Regular expression too big`), and each command has a step budget (60 M steps, about a second) that stops it with `<cmd>: regular expression too complex for the lab`. It finds the POSIX leftmost-longest match, as GNU does (this matters for `grep -o` and `sed s///`). Back-references (`\1` in a pattern) can't run in an NFA and print `back-references are not available in this lab`. Syntax errors use glibc's wording; grep also prints GNU 3.11's `warning: stray \ before x` and the `[:space:]` error.
- **grep** `-c -i -n -v -o -E -F -G -w -x -h -H -l -q -s -a -e -m`; `file:` prefix for several files, `(standard input)`, `grep: FILE: binary file matches` on stderr for binary files, exit 0/1/2. Not available: `-r`, `-A/-B/-C`, `-P`, `-L`. Only the last `-E/-F/-G` counts, as in GNU.
- **awk** is a small interpreter: `-F` (`-Ft` is tab), `-v`, `var=value` operands, BEGIN/END, expression and `/re/` patterns, `print`/`printf`, `if`/`else`, `next`, `exit`, fields incl. `$(NF-k)` and field/NF assignment, NR NF FNR FS OFS ORS FILENAME OFMT CONVFMT, scalar variables with `= += -= *= /= %= ^= ++ --`, strnum comparisons, `~ !~ && || ! ?:`, `length substr index tolower toupper int sprintf`, `%.6g` output. No loops, arrays, user functions, getline, `system()`, redirection, pipes or RS (all "not available in this lab"), so a program runs in time linear in its input. Strings are capped at 8 MiB and field indexes at 100,000. Messages follow gawk (`awk: cmd. line:1: (FILENAME=x FNR=1) fatal: attempt to access field -1`, syntax errors with a caret). This is more than LLD §13.2's `{print $N}` rule.
- **sort** `-n -r -u -f -b -s -t -k POS1[,POS2][nrfb]` with GNU's field rules and last-resort comparison (reversed by `-r`, off with `-s`/`-u`). **uniq** `-c` (`%7d `) `-d -u -i -f -s -w`, `[INPUT [OUTPUT]]`. **wc** `-l -w -c -m -L` with GNU's column widths: 1 for one input and one count; otherwise the digits of the total regular-file size, at least 7 with stdin or a directory; a directory prints zeros after the error. **cut** `-f -d -c -b -s --complement --output-delimiter` with coreutils 9 messages.
- **sed** `-n -i[SUFFIX] -e -E/-r -s`; `s/re/rep/[g p N I]` (any delimiter, `&`, `\1`–`\9`, `\n`), `p d q =`, line/`$`/`/re/` addresses, ranges, `!`, `;`-separated commands; GNU's `-e expression #1, char N:` errors; keeps a missing final newline. Other commands (`y a i c n N h g x b t w r` …), blocks and `\U`/`\L` print "not available in this lab". This is more than LLD §13.2's `-i 's///[g]'`.
- Deviations: comparisons use byte order (C locale). Ubuntu's default `en_US.UTF-8` collation can order mixed-case or punctuated lines differently in `sort`, but every lab-step output is the same in both. `cut -c` counts characters (GNU counts bytes; the lab files are ASCII). `wc` can't tell a redirected file from a pipe on stdin, so `wc < file` with several counts uses width 7 where GNU uses the file size. Sub-match positions for `sed \1` follow leftmost-first priority among the longest matches; POSIX's sub-match rules differ only in ambiguous cases. Ubuntu's `awk` is mawk, but error wording follows gawk.
