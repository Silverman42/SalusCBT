// Shared helpers for the text commands (T-704): option parsing that keeps
// repeated values (`sort -k1 -k2`, `grep -e a -e b`), line splitting, input
// reading, and turning regex errors into messages.

import {
  fail,
  notAvailable,
  readOperand,
  type CommandContext,
  type OptionSpec,
  type ReadResult,
} from "../command";
import type { FileContent } from "../vfs";
import { RegexLimitError, RegexSyntaxError, RegexUnsupportedError } from "./regex";

export interface MultiOptionSpec extends OptionSpec {
  /** Short options whose value must be attached (`sed -i.bak`); alone they are flags. */
  optional?: string;
}

export interface MultiOptions {
  flags: Set<string>;
  /** Every value given for each value option, in order. */
  values: Map<string, string[]>;
  operands: string[];
}

/**
 * Like parseOptions in ../command.ts (GNU getopt style, LB-3 wording for
 * unknown options) but keeps every value of a repeated option.
 */
export function parseOpts(ctx: CommandContext, spec: MultiOptionSpec): MultiOptions | null {
  const flags = new Set<string>();
  const values = new Map<string, string[]>();
  const operands: string[] = [];
  const add = (key: string, value: string) => {
    const list = values.get(key);
    if (list) list.push(value);
    else values.set(key, [value]);
  };
  const args = ctx.args;
  const flagChars = spec.flags ?? "";
  const valueChars = spec.values ?? "";
  const optionalChars = spec.optional ?? "";

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
        add(opt.key, value);
      } else if (eq >= 0) {
        if (optionalChars.includes(opt.key)) {
          flags.add(opt.key);
          add(opt.key, arg.slice(eq + 1));
          continue;
        }
        fail(ctx, `option '--${name}' doesn't allow an argument`);
        return null;
      } else {
        flags.add(opt.key);
      }
      continue;
    }
    if (spec.numeric && /^-\d+$/.test(arg)) {
      add(spec.numeric, arg.slice(1));
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
        add(c, value);
        break;
      }
      if (optionalChars.includes(c)) {
        flags.add(c);
        const rest = arg.slice(j + 1);
        if (rest !== "") add(c, rest);
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

/** Last value of an option, if given. */
export function lastValue(opts: MultiOptions, key: string): string | undefined {
  const list = opts.values.get(key);
  return list?.[list.length - 1];
}

/** `Try 'name --help' for more information.` */
export function tryHelp(ctx: CommandContext, code = 1): number {
  ctx.stderr.write(`Try '${ctx.name} --help' for more information.\n`);
  return code;
}

/** A usage error: message plus the Try line, like coreutils. */
export function usageError(ctx: CommandContext, message: string, code = 1): number {
  fail(ctx, message);
  return tryHelp(ctx, code);
}

const strictDecoder = new TextDecoder("utf-8", { fatal: true });
const looseDecoder = new TextDecoder();

export function textOf(content: FileContent): string {
  return typeof content === "string" ? content : looseDecoder.decode(content);
}

/** GNU grep's test: a NUL byte or invalid UTF-8 makes a file binary. */
export function isBinary(content: FileContent): boolean {
  if (typeof content === "string") return content.includes("\0");
  if (content.includes(0)) return true;
  try {
    strictDecoder.decode(content);
    return false;
  } catch {
    return true;
  }
}

/** Lines without their `\n`; a final line without one is still a line. */
export function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Read an operand, or `-`/stdin. */
export function readInput(ctx: CommandContext, operand: string): ReadResult {
  return readOperand(ctx, operand);
}

/**
 * Run `fn`, turning regex errors into `<name>: <message>` (status 2): syntax
 * errors use glibc's wording, the step budget a lab message.
 */
export function withRegexErrors(
  ctx: CommandContext,
  fn: () => number,
  format: (message: string) => string = (m) => m,
): number {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RegexSyntaxError) return fail(ctx, format(e.message), 2);
    if (e instanceof RegexUnsupportedError) return fail(ctx, e.message, 2);
    if (e instanceof RegexLimitError) return fail(ctx, e.message, 2);
    throw e;
  }
}

/** Code points in a string (for -c character positions and wc -m). */
export function codePoints(s: string): string[] {
  return Array.from(s);
}
