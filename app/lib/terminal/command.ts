// The contract between the runner and lab commands (T-702).
//
// A command is a CommandSpec in its own module under ./commands/ and is listed
// in ./commands/index.ts. The runner never needs to change to add one:
//
//   export const wc: CommandSpec = {
//     name: "wc",
//     summary: "count lines (-l)",
//     run(ctx) {
//       const opts = parseOptions(ctx, { flags: "l" });
//       if (!opts) return 2;
//       ...
//       ctx.stdout.write(`${n}\n`);
//       return 0;
//     },
//   };
//
// `run` gets the expanded arguments (quotes removed, globs and ~ and $VAR
// expanded), stdin, stdout and stderr, and returns the exit status (or a
// promise of it, for Web Crypto). Write errors as `<name>: <message>\n` to
// stderr, like coreutils. A VfsError that escapes `run` is printed as
// `<name>: <path>: <message>` with status 1; other exceptions as an internal
// error. Commands must be bounded: no loops that don't consume input.

import type { Input, Output } from "./io";
import { VfsError, type FileContent, type Vfs } from "./vfs";

export interface ShellEnv {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
}

/** Shell-level effects a few builtins need. */
export interface ShellApi {
  /** Clear the screen (the `clear` command). */
  clear(): void;
  /** Every registered command, for `help`. */
  commands(): readonly CommandSpec[];
}

export interface CommandContext {
  /** argv[0] as typed (`grep`). */
  readonly name: string;
  /** Arguments after expansion, without argv[0]. */
  readonly args: readonly string[];
  readonly vfs: Vfs;
  readonly stdin: Input;
  readonly stdout: Output;
  readonly stderr: Output;
  readonly env: ShellEnv;
  readonly shell: ShellApi;
}

export type CommandResult = number | Promise<number>;

export interface CommandSpec {
  name: string;
  /** One line for `help`, e.g. "print lines that match (-c -i -n -v -o)". */
  summary: string;
  run(ctx: CommandContext): CommandResult;
}

export class CommandRegistry {
  private readonly map = new Map<string, CommandSpec>();

  constructor(specs: Iterable<CommandSpec> = []) {
    for (const spec of specs) this.register(spec);
  }

  register(spec: CommandSpec): this {
    if (this.map.has(spec.name)) throw new Error(`command registered twice: ${spec.name}`);
    this.map.set(spec.name, spec);
    return this;
  }

  get(name: string): CommandSpec | undefined {
    return this.map.get(name);
  }

  /** Sorted by name. */
  list(): CommandSpec[] {
    return [...this.map.values()].sort((a, b) => (a.name < b.name ? -1 : 1));
  }
}

// ---------------------------------------------------------------- helpers

/** Write `<name>: <message>` to stderr and return `code`. */
export function fail(ctx: CommandContext, message: string, code = 1): number {
  ctx.stderr.write(`${ctx.name}: ${message}\n`);
  return code;
}

/** LB-3: `<name>: <feature> is not available in this lab`, status 2. */
export function notAvailable(ctx: CommandContext, feature: string): number {
  return fail(ctx, `${feature} is not available in this lab`, 2);
}

/** `<name>: <path>: No such file or directory` for a VfsError; rethrows anything else. */
export function fileError(ctx: CommandContext, err: unknown, path?: string): number {
  if (err instanceof VfsError) return fail(ctx, `${path ?? err.path}: ${err.message}`);
  throw err;
}

export type ReadResult = { ok: true; content: FileContent } | { ok: false; error: VfsError };

/**
 * Read a file operand; `-` reads stdin. Errors (missing file, directory) are
 * returned, not printed, because coreutils words them differently per command.
 */
export function readOperand(ctx: CommandContext, operand: string): ReadResult {
  if (operand === "-") return { ok: true, content: ctx.stdin.content() };
  try {
    return { ok: true, content: ctx.vfs.read(operand) };
  } catch (err) {
    if (err instanceof VfsError) return { ok: false, error: err };
    throw err;
  }
}

export interface OptionSpec {
  /** Short flags without a value, e.g. "cinvo". */
  flags?: string;
  /** Short options that take a value, e.g. "nF" (`-n 5`, `-n5`, `-F:`). */
  values?: string;
  /** Long options: `--lines` → { key: "n", value: true }. */
  long?: Record<string, { key: string; value?: boolean }>;
  /** `-NUM` means `-<key> NUM` (`head -5`). */
  numeric?: string;
  /** Stop at the first operand instead of GNU-style permutation. */
  stopAtOperand?: boolean;
}

export interface ParsedOptions {
  /** Flags seen (short letter or long key). */
  flags: Set<string>;
  /** Last value given for each value option. */
  values: Map<string, string>;
  operands: string[];
}

/**
 * GNU getopt-style parsing: combined flags (`-nr`), attached or separate values
 * (`-F:`, `-n 5`, `--lines=5`), `--` ends options, `-` is an operand, and
 * options may follow operands. Unknown options print "not available in this
 * lab" (LB-3); a missing value prints coreutils' wording. Returns null after
 * printing, and the command should return 2.
 */
export function parseOptions(ctx: CommandContext, spec: OptionSpec): ParsedOptions | null {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const operands: string[] = [];
  const args = ctx.args;
  const flagChars = spec.flags ?? "";
  const valueChars = spec.values ?? "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === "--") {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (arg === "-" || !arg.startsWith("-")) {
      if (spec.stopAtOperand) {
        operands.push(...args.slice(i));
        break;
      }
      operands.push(arg);
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = arg.slice(2, eq < 0 ? undefined : eq);
      const opt = spec.long?.[name];
      if (!opt) {
        notAvailable(ctx, `option '--${name}'`);
        return null;
      }
      if (opt.value) {
        const value = eq < 0 ? args[++i] : arg.slice(eq + 1);
        if (value === undefined) {
          fail(ctx, `option '--${name}' requires an argument`);
          return null;
        }
        values.set(opt.key, value);
      } else if (eq >= 0) {
        fail(ctx, `option '--${name}' doesn't allow an argument`);
        return null;
      } else {
        flags.add(opt.key);
      }
      continue;
    }
    if (spec.numeric && /^-\d+$/.test(arg)) {
      values.set(spec.numeric, arg.slice(1));
      continue;
    }
    for (let j = 1; j < arg.length; j++) {
      const c = arg[j]!;
      if (valueChars.includes(c)) {
        const rest = arg.slice(j + 1);
        const value = rest !== "" ? rest : args[++i];
        if (value === undefined) {
          fail(ctx, `option requires an argument -- '${c}'`);
          return null;
        }
        values.set(c, value);
        break;
      }
      if (!flagChars.includes(c)) {
        notAvailable(ctx, `option '-${c}'`);
        return null;
      }
      flags.add(c);
    }
  }
  return { flags, values, operands };
}
