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

- [x] Pipes of 3+ commands work.
- [ ] Terminal is keyboard- and screen-reader-friendly.

## Notes

- Lexer, runner and builtins are done: `lexer.ts`, `glob.ts`, `io.ts`, `command.ts`, `runner.ts`, `commands/builtins.ts`, `commands/index.ts`, tested in `tests/unit/terminal-runner.test.ts`. `Terminal.vue` is **not** done (left for the lab page work with T-706), so the screen-reader criterion stays open.
- Syntax: words, `'…'`, `"…"` (backslash escapes `$`, `"`, `\` and backtick), backslash escapes outside quotes, `|`, `&&`, `||`, `;`, `#` comments, `>`, `>>`, `<`, `2>`, `2>>`, `2>&1`, `>&2`, `&>`, `&>>` (`/dev/null` works), `$VAR`, `${VAR}`, `$?`, `~` and `~/…`, globs `*`, `?`, `[...]` (`[!x]`, `[a-z]`, `[[:digit:]]`; a leading dot must be typed; no match keeps the word). `&`, `( )`, `$( )`, backticks, here-docs and `NAME=value` print "… not available in this lab". Syntax errors use bash's wording (`bash: syntax error near unexpected token ...`) with status 2. Simplification: `$VAR` values are not word-split or globbed.
- Unknown names print `bash: foo: command not found` (status 127). Real commands the lab lacks (rm, nmap, sudo and so on, plus the LB-2 names until T-703/T-704 register them) print `bash: rm: not available in this lab (type 'help' to list the commands)` (LB-3). Unknown options through `parseOptions` print `<cmd>: option '-x' is not available in this lab` (status 2).
- Command contract (`command.ts`): a module exports a `CommandSpec { name, summary, run(ctx) }` and is listed in `commands/index.ts`; the runner needs no change. `ctx` has `args` (expanded), `vfs`, `stdin` (`text()`, `bytes()`, `content()`), `stdout`/`stderr` (`write(string | Uint8Array)`), `env` and `shell` (`clear()`, `commands()`). `run` returns the exit status or a promise of it. Helpers: `parseOptions` (GNU getopt style; `numeric` handles `head -5`), `readOperand` (`-` is stdin), `fail`, `fileError`, `notAvailable`. A `VfsError` that escapes `run` prints `<cmd>: <path>: <message>` with status 1.
- Pipeline stages run one after another, each getting the previous stage's whole output. stderr goes straight to the screen, so earlier stages' errors appear before the last stage's output. `RunResult.chunks` keeps stdout and stderr in write order, with a `{ type: "clear" }` chunk from `clear`.
- Limits (`DEFAULT_LIMITS`): 4096 characters per line, 32 commands per line, 16 per pipeline, 1024 arguments, 1000 glob matches, 8 MiB per pipe or redirected file (a 2 MiB installer fits), 256 KiB on screen per line (then the output is cut with a notice and the line stops).
- Builtins: `cd` (with `cd -` and `OLDPWD`; T-703 lists `cd`, but it is done here), `pwd`, `echo` (`-n`, `-e`), `clear`, `help`, `true`, `false`. `Shell.prompt()` gives `root@lab:~/secplus-lab# `. Call `Shell.run()` one line at a time (await each).
