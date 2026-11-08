// chmod for the terminal lab (T-703, LLD §13.2, LB-2), GNU coreutils 9.x.
//
//   chmod [-R] [-v | -c] [-f] MODE FILE...
//
// MODE is octal (`600`, `0640`, `4755`) or symbolic (`u+x`, `go-w`, `a=r`,
// `u=rw,go=`, `+x`, `g=u`). Without a who letter, the lab's umask 022 masks
// the change, as in GNU. Like GNU, `-w`-style modes may be written as options.
// Permissions are stored, not enforced (vfs.ts). Directories keep their
// setuid/setgid bits under a numeric mode of fewer than five digits.

import { fail, notAvailable, type CommandContext, type CommandSpec } from "../command";
import { formatMode, octalMode, type VfsStat } from "../vfs";
import { joinPath, quote, quoteAlways, quoteIfNeeded, tryStat, usageError } from "./fileUtil";

const UMASK = 0o022;
const MODE_OPTION_CHARS = /^-[rwxXstugoa,+=0-7-]+$/;

type ModeFn = (old: number, isDir: boolean) => number;

const WHO: Record<string, number> = { u: 0o4700, g: 0o2070, o: 0o1007, a: 0o7777 };

/** Compile an octal or symbolic mode; undefined if invalid. */
export function compileMode(text: string, umask = UMASK): ModeFn | undefined {
  if (/^[0-7]+$/.test(text)) {
    const value = parseInt(text, 8);
    if (value > 0o7777) return undefined;
    const keepDirBits = text.length < 5;
    return (old, isDir) => (isDir && keepDirBits ? value | (old & 0o6000) : value);
  }
  // GNU modechange.c: each action has `affected` (who bits, 0 = none given),
  // a value (perm bits) and `mentioned` (bits named; a directory keeps its
  // setuid/setgid unless they are).
  const steps: ModeFn[] = [];
  for (const clause of text.split(",")) {
    const m = /^([ugoa]*)((?:[-+=](?:[rwxXst]*|[ugo]))+)$/.exec(clause);
    if (!m) return undefined;
    const affected = [...m[1]!].reduce((acc, c) => acc | WHO[c]!, 0);
    for (const action of m[2]!.match(/[-+=][^-+=]*/g)!) {
      const op = action[0]!;
      const perms = action.slice(1);
      const copy = /^[ugo]$/.test(perms) ? perms : undefined;
      let permBits = 0;
      if (!copy) {
        for (const c of perms) {
          if (c === "r") permBits |= 0o444;
          else if (c === "w") permBits |= 0o222;
          else if (c === "x") permBits |= 0o111;
          else if (c === "s") permBits |= 0o6000;
          else if (c === "t") permBits |= 0o1000;
        }
      }
      const anyX = !copy && perms.includes("X");
      const mentioned = affected ? affected & permBits : permBits;
      steps.push((mode, isDir) => {
        let value = permBits;
        if (copy) {
          const shift = copy === "u" ? 6 : copy === "g" ? 3 : 0;
          const p = (mode >> shift) & 7;
          value = (p << 6) | (p << 3) | p;
        }
        if (anyX && (isDir || (mode & 0o111) !== 0)) value |= 0o111;
        const omit = isDir ? 0o6000 & ~mentioned : 0;
        value &= (affected ? affected : ~umask & 0o7777) & ~omit;
        if (op === "+") return mode | value;
        if (op === "-") return mode & ~value;
        const preserved = (affected ? ~affected : 0) | omit;
        return (mode & preserved) | value;
      });
    }
  }
  return (old, isDir) => steps.reduce((mode, step) => step(mode, isDir) & 0o7777, old);
}

interface ChmodOptions {
  recursive: boolean;
  verbose: boolean;
  changes: boolean;
  quiet: boolean;
}

function describe(st: VfsStat, mode: number): string {
  return `${octalMode(mode).padStart(4, "0")} (${formatMode(st.kind, mode).slice(1)})`;
}

interface CompiledMode {
  fn: ModeFn;
  /** The same mode with umask 0, when the umask applies (a clause with no who). */
  naive?: ModeFn;
}

/** Apply to one file (and below, with -R). Returns false after a diagnostic. */
function apply(
  ctx: CommandContext,
  path: string,
  st: VfsStat,
  mode: CompiledMode,
  opts: ChmodOptions,
): boolean {
  const isDir = st.kind === "dir";
  const next = mode.fn(st.mode, isDir);
  ctx.vfs.chmod(path, next);
  const changed = next !== st.mode;
  if (opts.verbose || (opts.changes && changed)) {
    ctx.stdout.write(
      changed
        ? `mode of ${quoteAlways(path)} changed from ${describe(st, st.mode)} to ${describe(st, next)}\n`
        : `mode of ${quoteAlways(path)} retained as ${describe(st, next)}\n`,
    );
  }
  let ok = true;
  // GNU: `chmod -w f` with umask 022 leaves g+w/o+w alone and says so.
  const naive = mode.naive?.(st.mode, isDir);
  if (naive !== undefined && (next & ~naive) !== 0) {
    const perms = (m: number) => formatMode(st.kind, m).slice(1);
    fail(ctx, `${quoteIfNeeded(path)}: new permissions are ${perms(next)}, not ${perms(naive)}`);
    ok = false;
  }
  if (opts.recursive && isDir) {
    for (const name of ctx.vfs.list(path)) {
      const child = joinPath(path, name);
      ok = apply(ctx, child, ctx.vfs.stat(child), mode, opts) && ok;
    }
  }
  return ok;
}

const LONG: Record<string, keyof ChmodOptions> = {
  recursive: "recursive",
  verbose: "verbose",
  changes: "changes",
  silent: "quiet",
  quiet: "quiet",
};
const SHORT: Record<string, keyof ChmodOptions> = {
  R: "recursive",
  v: "verbose",
  c: "changes",
  f: "quiet",
};

export const chmod: CommandSpec = {
  name: "chmod",
  summary: "change permissions (600, 0640, u+x, go-w; -R -v)",
  run(ctx) {
    const opts: ChmodOptions = { recursive: false, verbose: false, changes: false, quiet: false };
    let mode: string | undefined;
    const operands: string[] = [];
    const args = ctx.args;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--") {
        operands.push(...args.slice(i + 1));
        break;
      }
      if (arg.startsWith("--")) {
        const key = LONG[arg.slice(2)];
        if (!key) return notAvailable(ctx, `option '${arg.split("=")[0]}'`);
        opts[key] = true;
        continue;
      }
      if (arg.length > 1 && arg.startsWith("-")) {
        if (mode === undefined && MODE_OPTION_CHARS.test(arg)) {
          mode = arg;
          continue;
        }
        for (const c of arg.slice(1)) {
          const key = SHORT[c];
          if (!key) return notAvailable(ctx, `option '-${c}'`);
          opts[key] = true;
        }
        continue;
      }
      operands.push(arg);
    }
    if (mode === undefined) mode = operands.shift();
    if (mode === undefined) return usageError(ctx, "missing operand");
    if (operands.length === 0) return usageError(ctx, `missing operand after ${quote(mode)}`);
    const fn = compileMode(mode);
    if (!fn) return usageError(ctx, `invalid mode: ${quote(mode)}`);
    const usesUmask = !/^[0-7]+$/.test(mode) && mode.split(",").some((c) => /^[-+=]/.test(c));
    const compiled: CompiledMode = { fn, naive: usesUmask ? compileMode(mode, 0) : undefined };

    let code = 0;
    for (const operand of operands) {
      const r = tryStat(ctx.vfs, operand);
      if (!r.ok) {
        if (!opts.quiet) {
          ctx.stderr.write(`chmod: cannot access ${quoteAlways(operand)}: ${r.error.message}\n`);
        }
        code = 1;
        continue;
      }
      if (!apply(ctx, operand, r.stat, compiled, opts)) code = 1;
    }
    return code;
  },
};
