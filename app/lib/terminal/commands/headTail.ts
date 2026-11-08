// head and tail for the terminal lab (T-703, LB-2), GNU coreutils 9.x:
//
//   head [-n [-]N | -N | -c [-]N] [-q | -v] [FILE...]   (default: 10 lines)
//   tail [-n [+]N | -N | -c [+]N] [-q | -v] [FILE...]
//
// `head -n -N` prints all but the last N lines; `tail -n +N` starts at line N.
// N may carry a suffix (b, K, KiB, kB, M, MiB, MB, G…). Several files get
// `==> name <==` headers. `tail -f` / `-F` can't follow in a lab with no
// writers, so they print "not available in this lab".

import {
  fail,
  notAvailable,
  parseOptions,
  readOperand,
  type CommandContext,
  type CommandSpec,
} from "../command";
import type { FileContent } from "../vfs";
import { byteLength, joinContent, quote, quoteAlways, sliceBytes, splitLines } from "./fileUtil";

const SUFFIXES: Record<string, number> = {
  "": 1,
  b: 512,
  kB: 1000,
  K: 1024,
  KiB: 1024,
  MB: 1000 ** 2,
  M: 1024 ** 2,
  MiB: 1024 ** 2,
  GB: 1000 ** 3,
  G: 1024 ** 3,
  GiB: 1024 ** 3,
};

interface Count {
  /** Lines or bytes. */
  bytes: boolean;
  n: number;
  /** head: `-N` (all but the last N). tail: `+N` (from the Nth). */
  sign: boolean;
}

function parseCount(
  ctx: CommandContext,
  raw: string,
  bytes: boolean,
  signChar: "-" | "+",
): Count | null {
  const m = /^([+-]?)(\d+)([A-Za-z]*)$/.exec(raw);
  const mult = m ? SUFFIXES[m[3]!] : undefined;
  // head ignores a leading '+'; tail treats a leading '-' as the default.
  if (!m || mult === undefined) {
    fail(ctx, `invalid number of ${bytes ? "bytes" : "lines"}: ${quote(raw)}`);
    return null;
  }
  return { bytes, n: Number(m[2]) * mult, sign: m[1] === signChar };
}

function headOf(content: FileContent, c: Count): FileContent {
  if (c.bytes) {
    const len = byteLength(content);
    return sliceBytes(content, 0, c.sign ? Math.max(0, len - c.n) : c.n);
  }
  const lines = splitLines(content);
  return joinContent(
    c.sign ? lines.slice(0, Math.max(0, lines.length - c.n)) : lines.slice(0, c.n),
  );
}

function tailOf(content: FileContent, c: Count): FileContent {
  if (c.bytes) {
    const len = byteLength(content);
    return sliceBytes(content, c.sign ? Math.max(0, c.n - 1) : Math.max(0, len - c.n));
  }
  const lines = splitLines(content);
  if (c.sign) return joinContent(lines.slice(Math.max(0, c.n - 1)));
  return joinContent(c.n === 0 ? [] : lines.slice(-c.n));
}

function headTail(kind: "head" | "tail"): CommandSpec {
  const isTail = kind === "tail";
  return {
    name: kind,
    summary: isTail
      ? "print the last lines (-n N, -n +N, -N, -c N)"
      : "print the first lines (-n N, -n -N, -N, -c N)",
    run(ctx) {
      const parsed = parseOptions(ctx, {
        flags: isTail ? "qvfF" : "qv",
        values: "nc",
        numeric: "n",
        long: {
          lines: { key: "n", value: true },
          bytes: { key: "c", value: true },
          quiet: { key: "q" },
          silent: { key: "q" },
          verbose: { key: "v" },
          ...(isTail ? { follow: { key: "f" } } : {}),
        },
      });
      if (!parsed) return 2;
      const f = parsed.flags;
      if (f.has("f")) return notAvailable(ctx, "-f (follow)");
      if (f.has("F")) return notAvailable(ctx, "-F (follow)");

      // The last of -n / -c wins in GNU; checking -c's position in argv is
      // overkill for the lab, so -c simply takes precedence when both appear.
      const signChar = isTail ? "+" : "-";
      const rawBytes = parsed.values.get("c");
      const count =
        rawBytes !== undefined
          ? parseCount(ctx, rawBytes, true, signChar)
          : parseCount(ctx, parsed.values.get("n") ?? "10", false, signChar);
      if (!count) return 1;

      const files = parsed.operands.length > 0 ? parsed.operands : ["-"];
      const headers = f.has("v") || (files.length > 1 && !f.has("q"));
      let code = 0;
      let first = true;
      for (const file of files) {
        const r = readOperand(ctx, file);
        if (!r.ok) {
          const msg =
            r.error.code === "EISDIR"
              ? `error reading ${quoteAlways(file)}: Is a directory`
              : `cannot open ${quoteAlways(file)} for reading: ${r.error.message}`;
          // GNU still prints the header for a directory, not for a missing file.
          if (r.error.code === "EISDIR" && headers) {
            ctx.stdout.write(`${first ? "" : "\n"}==> ${file} <==\n`);
            first = false;
          }
          code = fail(ctx, msg);
          continue;
        }
        if (headers) {
          const name = file === "-" ? "standard input" : file;
          ctx.stdout.write(`${first ? "" : "\n"}==> ${name} <==\n`);
        }
        first = false;
        ctx.stdout.write(isTail ? tailOf(r.content, count) : headOf(r.content, count));
      }
      return code;
    },
  };
}

export const head = headTail("head");
export const tail = headTail("tail");
