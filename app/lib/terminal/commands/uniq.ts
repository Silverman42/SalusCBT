// uniq (T-704, LB-2): collapse adjacent repeated lines. GNU coreutils 9.x:
// `-c` prefixes `%7d ` counts, `-d` keeps only repeated lines, `-u` only
// unique ones, `-i` ignores case, `-f N`/`-s N`/`-w N` choose what is compared.
// Operands: [INPUT [OUTPUT]].

import { fail, fileError, type CommandContext, type CommandSpec } from "../command";
import { lastValue, parseOpts, readInput, splitLines, textOf, usageError } from "./textUtil";

const isBlank = (c: string) => c === " " || c === "\t";

function key(line: string, fields: number, chars: number, width: number, fold: boolean): string {
  let i = 0;
  for (let k = 0; k < fields && i < line.length; k++) {
    while (i < line.length && isBlank(line[i]!)) i++;
    while (i < line.length && !isBlank(line[i]!)) i++;
  }
  i = Math.min(line.length, i + chars);
  let k = line.slice(i);
  if (Number.isFinite(width)) k = k.slice(0, width);
  return fold ? k.toUpperCase() : k;
}

function uniq(ctx: CommandContext): number {
  const opts = parseOpts(ctx, {
    flags: "cdui",
    values: "fsw",
    long: {
      count: { key: "c" },
      repeated: { key: "d" },
      unique: { key: "u" },
      "ignore-case": { key: "i" },
      "skip-fields": { key: "f", value: true },
      "skip-chars": { key: "s", value: true },
      "check-chars": { key: "w", value: true },
    },
  });
  if (!opts) return 2;
  const f = opts.flags;

  const num = (k: string, what: string): number | undefined | null => {
    const v = lastValue(opts, k);
    if (v === undefined) return undefined;
    if (!/^\d+$/.test(v)) {
      fail(ctx, `invalid number of ${what}: '${v}'`);
      return null;
    }
    return Number(v);
  };
  const fields = num("f", "fields to skip");
  const chars = num("s", "bytes to skip");
  const width = num("w", "bytes to compare");
  if (fields === null || chars === null || width === null) return 1;

  if (opts.operands.length > 2) return usageError(ctx, `extra operand '${opts.operands[2]}'`);
  const input = opts.operands[0] ?? "-";
  const output = opts.operands[1];

  const read = readInput(ctx, input);
  if (!read.ok) return fail(ctx, `${input}: ${read.error.message}`);
  const lines = splitLines(textOf(read.content));

  const out: string[] = [];
  const emit = (line: string, n: number) => {
    if (f.has("d") && n < 2) return;
    if (f.has("u") && n > 1) return;
    out.push(f.has("c") ? `${String(n).padStart(7)} ${line}\n` : `${line}\n`);
    if (output === undefined && out.length >= 256) ctx.stdout.write(out.splice(0).join(""));
  };
  const keyOf = (line: string) => key(line, fields ?? 0, chars ?? 0, width ?? Infinity, f.has("i"));

  let current: string | undefined;
  let currentKey = "";
  let n = 0;
  for (const line of lines) {
    const k = keyOf(line);
    if (current !== undefined && k === currentKey) {
      n++;
      continue;
    }
    if (current !== undefined) emit(current, n);
    current = line;
    currentKey = k;
    n = 1;
  }
  if (current !== undefined) emit(current, n);

  if (output === undefined || output === "-") {
    ctx.stdout.write(out.join(""));
    return 0;
  }
  try {
    ctx.vfs.writeFile(output, out.join(""));
  } catch (err) {
    return fileError(ctx, err, output);
  }
  return 0;
}

export const uniqCommand: CommandSpec = {
  name: "uniq",
  summary: "collapse repeated adjacent lines (-c -d -u -i)",
  run: uniq,
};
