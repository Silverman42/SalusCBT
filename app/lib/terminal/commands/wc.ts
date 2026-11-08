// wc (T-704, LB-2). GNU coreutils 9.x output: counts in the order lines,
// words, characters, bytes, max line length; a total line for several files.
// Column width follows GNU: 1 when there is one input and one count, else the
// digits of the total size of the regular files, at least 7 if stdin or a
// directory is among the inputs.

import { fail, type CommandContext, type CommandSpec } from "../command";
import { utf8Length } from "../io";
import type { FileContent } from "../vfs";
import { parseOpts, readInput, textOf } from "./textUtil";

interface Counts {
  lines: number;
  words: number;
  chars: number;
  bytes: number;
  max: number;
}

const isWs = (c: number) => c === 32 || (c >= 9 && c <= 13);

function count(content: FileContent): Counts {
  const text = textOf(content);
  const bytes = typeof content === "string" ? utf8Length(content) : content.length;
  let lines = 0;
  let words = 0;
  let chars = 0;
  let max = 0;
  let col = 0;
  let inWord = false;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    chars++;
    if (c === 10) {
      lines++;
      if (col > max) max = col;
      col = 0;
    } else if (c === 9) {
      col += 8 - (col % 8);
    } else if (c === 13 || c === 12) {
      if (c === 13) col = 0;
    } else if (c >= 32) {
      col++;
    }
    if (isWs(c)) {
      inWord = false;
    } else if (!inWord) {
      inWord = true;
      words++;
    }
  }
  if (col > max) max = col;
  return { lines, words, chars, bytes, max };
}

function wc(ctx: CommandContext): number {
  const opts = parseOpts(ctx, {
    flags: "lwcmL",
    long: {
      lines: { key: "l" },
      words: { key: "w" },
      bytes: { key: "c" },
      chars: { key: "m" },
      "max-line-length": { key: "L" },
    },
  });
  if (!opts) return 2;
  const f = opts.flags;
  const none = !["l", "w", "c", "m", "L"].some((k) => f.has(k));
  const show = {
    lines: none || f.has("l"),
    words: none || f.has("w"),
    chars: f.has("m"),
    bytes: none || f.has("c"),
    max: f.has("L"),
  };
  const shown = Object.values(show).filter(Boolean).length;
  const inputs = opts.operands.length > 0 ? opts.operands : [undefined];

  interface Row {
    name: string | undefined;
    counts: Counts;
    regular: boolean;
    error?: string;
    missing: boolean;
  }
  const zero: Counts = { lines: 0, words: 0, chars: 0, bytes: 0, max: 0 };
  const rows: Row[] = inputs.map((operand) => {
    const read = readInput(ctx, operand ?? "-");
    if (read.ok) {
      return {
        name: operand,
        counts: count(read.content),
        regular: operand !== undefined && operand !== "-",
        missing: false,
      };
    }
    const msg = `${operand}: ${read.error.message}`;
    // A directory opens but fails to read: GNU still prints zeros for it.
    const missing = read.error.code !== "EISDIR";
    return { name: operand, counts: zero, regular: false, error: msg, missing };
  });

  let width = 1;
  if (!(inputs.length === 1 && shown === 1) && !rows[0]!.missing) {
    let minimum = 1;
    let total = 0;
    for (const r of rows) {
      if (r.missing) continue;
      if (!r.regular) minimum = 7;
      else total += r.counts.bytes;
    }
    width = Math.max(String(total).length, minimum);
  }

  const line = (c: Counts, name: string | undefined) => {
    const nums: number[] = [];
    if (show.lines) nums.push(c.lines);
    if (show.words) nums.push(c.words);
    if (show.chars) nums.push(c.chars);
    if (show.bytes) nums.push(c.bytes);
    if (show.max) nums.push(c.max);
    const text = nums.map((n) => String(n).padStart(width)).join(" ");
    ctx.stdout.write(name === undefined ? `${text}\n` : `${text} ${name}\n`);
  };

  let code = 0;
  const total: Counts = { ...zero };
  for (const r of rows) {
    if (r.error) code = fail(ctx, r.error);
    if (r.missing) continue;
    line(r.counts, r.name);
    total.lines += r.counts.lines;
    total.words += r.counts.words;
    total.chars += r.counts.chars;
    total.bytes += r.counts.bytes;
    total.max = Math.max(total.max, r.counts.max);
  }
  if (rows.length > 1) line(total, "total");
  return code;
}

export const wcCommand: CommandSpec = {
  name: "wc",
  summary: "count lines, words and bytes (-l -w -c -m)",
  run: wc,
};
