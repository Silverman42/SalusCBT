// cut (T-704, LB-2). GNU coreutils 9.x: -f LIST with -d DELIM (default tab),
// -c/-b LIST (characters; the lab's files are ASCII so bytes and characters
// agree), -s, --complement, --output-delimiter. Lines without the delimiter
// are printed whole unless -s. Messages follow coreutils.

import { fail, type CommandContext, type CommandSpec } from "../command";
import { lastValue, parseOpts, readInput, splitLines, textOf, usageError } from "./textUtil";

type Ranges = [number, number][];

class ListError extends Error {}

function parseList(list: string, fields: boolean): Ranges {
  const what = fields ? "field" : "byte/character position";
  if (list === "")
    throw new ListError(`missing list of ${fields ? "fields" : "byte/character positions"}`);
  const ranges: Ranges = [];
  for (const part of list.split(/[, \t]/)) {
    if (part === "") continue;
    const m = /^(\d*)(-?)(\d*)$/.exec(part);
    if (!m) throw new ListError(`invalid ${what} value '${part}'`);
    const [, a, dash, b] = m;
    if (!dash) {
      const n = Number(a);
      if (n === 0)
        throw new ListError(
          `${fields ? "fields" : "byte/character positions"} are numbered from 1`,
        );
      ranges.push([n, n]);
      continue;
    }
    if (a === "" && b === "") {
      throw new ListError(`invalid ${fields ? "field" : "byte or character"} range`);
    }
    const lo = a === "" ? 1 : Number(a);
    const hi = b === "" ? Infinity : Number(b);
    if (lo === 0)
      throw new ListError(`${fields ? "fields" : "byte/character positions"} are numbered from 1`);
    if (hi < lo) throw new ListError("invalid decreasing range");
    ranges.push([lo, hi]);
  }
  if (ranges.length === 0)
    throw new ListError(`missing list of ${fields ? "fields" : "byte/character positions"}`);
  return ranges;
}

function cut(ctx: CommandContext): number {
  const opts = parseOpts(ctx, {
    flags: "sn",
    values: "bcfd",
    long: {
      bytes: { key: "b", value: true },
      characters: { key: "c", value: true },
      fields: { key: "f", value: true },
      delimiter: { key: "d", value: true },
      "only-delimited": { key: "s" },
      complement: { key: "complement" },
      "output-delimiter": { key: "output-delimiter", value: true },
    },
  });
  if (!opts) return 2;
  const lists = (["b", "c", "f"] as const).flatMap((k) => (opts.values.get(k) ?? []).map(() => k));
  if (lists.length === 0) {
    return usageError(ctx, "you must specify a list of bytes, characters, or fields");
  }
  if (lists.length > 1) return usageError(ctx, "only one list may be specified");
  const mode = lists[0]!;
  const fields = mode === "f";
  const delimArg = lastValue(opts, "d");
  if (delimArg !== undefined && !fields) {
    return usageError(ctx, "an input delimiter may be specified only when operating on fields");
  }
  if (opts.flags.has("s") && !fields) {
    return usageError(
      ctx,
      "suppressing non-delimited lines makes sense\n\tonly when operating on fields",
    );
  }
  if (delimArg !== undefined && Array.from(delimArg).length > 1) {
    return usageError(ctx, "the delimiter must be a single character");
  }
  // `-d ''` is a NUL delimiter in GNU cut.
  const delim = delimArg === undefined ? "\t" : delimArg === "" ? "\0" : delimArg;

  let ranges: Ranges;
  try {
    ranges = parseList(lastValue(opts, mode)!, fields);
  } catch (e) {
    if (e instanceof ListError) return usageError(ctx, e.message);
    throw e;
  }
  const complement = opts.flags.has("complement");
  const selected = (n: number) => ranges.some(([lo, hi]) => n >= lo && n <= hi) !== complement;
  const outDelim = lastValue(opts, "output-delimiter");

  let code = 0;
  for (const file of opts.operands.length > 0 ? opts.operands : ["-"]) {
    const read = readInput(ctx, file);
    if (!read.ok) {
      code = fail(ctx, `${file}: ${read.error.message}`);
      continue;
    }
    const out: string[] = [];
    for (const line of splitLines(textOf(read.content))) {
      if (fields) {
        if (!line.includes(delim)) {
          if (!opts.flags.has("s")) out.push(line);
          continue;
        }
        const parts = line.split(delim);
        out.push(parts.filter((_, i) => selected(i + 1)).join(outDelim ?? delim));
      } else {
        const chars = Array.from(line);
        let s = "";
        let last = -2;
        chars.forEach((ch, i) => {
          if (!selected(i + 1)) return;
          if (outDelim !== undefined && last >= 0 && i !== last + 1) s += outDelim;
          s += ch;
          last = i;
        });
        out.push(s);
      }
      if (out.length >= 256) ctx.stdout.write(out.splice(0).join("\n") + "\n");
    }
    if (out.length > 0) ctx.stdout.write(out.join("\n") + "\n");
  }
  return code;
}

export const cutCommand: CommandSpec = {
  name: "cut",
  summary: "keep selected fields or characters (-d SEP -f LIST, -c LIST)",
  run: cut,
};
