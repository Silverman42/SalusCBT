// stat for the terminal lab (T-703, LLD §13.2, LB-2), GNU coreutils 9.x.
//
//   stat FILE...                 the default multi-line report
//   stat -c FORMAT FILE...       e.g. `stat -c '%a %n' etc/shadow` → `646 etc/shadow`
//   stat --printf=FORMAT FILE…   no trailing newline; \n \t \\ escapes
//
// Directives: %a %A %b %B %d %D %f %F %g %G %h %i %n %N %o %s %u %U %w %W
// %x %X %y %Y %z %Z %m %t %T %%, with printf flags/width/precision (`%-10s`,
// `%04a`). Device and inode numbers are made up (stable per path); times are
// the stored mtime (the lab keeps no atime/ctime/birth time).

import { parseOptions, type CommandContext, type CommandSpec } from "../command";
import { formatMode, octalMode, type VfsStat } from "../vfs";
import {
  blocks512,
  idOf,
  linkCount,
  quoteAlways,
  quoteIfNeeded,
  statDate,
  tryStat,
  usageError,
} from "./fileUtil";

const DEFAULT_FORMAT =
  "  File: %N\n" +
  "  Size: %-10s\tBlocks: %-10b IO Block: %-6o %F\n" +
  "Device: %Hd,%Ld\tInode: %-11i Links: %h\n" +
  "Access: (%04a/%10.10A)  Uid: (%5u/%8U)   Gid: (%5g/%8G)\n" +
  "Access: %x\n" +
  "Modify: %y\n" +
  "Change: %z\n" +
  " Birth: %w\n";

/** ext4 on /dev/sda1 (8,1). */
const DEV_MAJOR = 8;
const DEV_MINOR = 1;

/** A stable fake inode number per path. */
function inodeOf(path: string): number {
  let h = 2166136261;
  for (let i = 0; i < path.length; i++) h = Math.imul(h ^ path.charCodeAt(i), 16777619);
  return 1_000_000 + ((h >>> 0) % 9_000_000);
}

function fileType(st: VfsStat): string {
  if (st.kind === "dir") return "directory";
  return st.size === 0 ? "regular empty file" : "regular file";
}

type Value = { num: number | string } | { str: string };

function directive(ctx: CommandContext, name: string, st: VfsStat, conv: string): Value {
  const secs = Math.floor(st.mtime / 1000);
  switch (conv) {
    case "a":
      return { num: octalMode(st.mode).replace(/^0+(?=.)/, "") };
    case "A":
      return { str: formatMode(st.kind, st.mode) };
    case "b":
      return { num: blocks512(st) };
    case "B":
      return { num: 512 };
    case "d":
      return { num: DEV_MAJOR * 256 + DEV_MINOR };
    case "Hd":
      return { num: DEV_MAJOR };
    case "Ld":
      return { num: DEV_MINOR };
    case "D":
      return { str: (DEV_MAJOR * 256 + DEV_MINOR).toString(16) };
    case "f":
      return { str: ((st.kind === "dir" ? 0o40000 : 0o100000) | st.mode).toString(16) };
    case "F":
      return { str: fileType(st) };
    case "g":
      return { num: idOf(st.group) };
    case "G":
      return { str: st.group };
    case "h":
      return { num: linkCount(ctx.vfs, st) };
    case "i":
      return { num: inodeOf(st.path) };
    case "m":
      return { str: "/" };
    case "n":
      return { str: name };
    case "N":
      return { str: quoteIfNeeded(name) };
    case "o":
      return { num: 4096 };
    case "s":
      return { num: st.size };
    case "t":
    case "T":
    case "Hr":
    case "Lr":
      return { str: "0" };
    case "u":
      return { num: idOf(st.owner) };
    case "U":
      return { str: st.owner };
    case "w":
    case "x":
    case "y":
    case "z":
      return { str: statDate(st.mtime) };
    case "W":
    case "X":
    case "Y":
    case "Z":
      return { num: secs };
    default:
      return { str: "?" };
  }
}

function pad(value: Value, flags: string, width: number | undefined, prec: number | undefined) {
  let s = "num" in value ? String(value.num) : value.str;
  if ("str" in value && prec !== undefined) s = s.slice(0, prec);
  if (width === undefined || s.length >= width) return s;
  if (flags.includes("-")) return s.padEnd(width);
  if ("num" in value && flags.includes("0")) return s.padStart(width, "0");
  return s.padStart(width);
}

/** Expand a stat FORMAT for one file. */
export function formatStat(ctx: CommandContext, format: string, name: string, st: VfsStat) {
  return format.replace(
    /%([-#0 +']*)(\d+)?(?:\.(\d+))?([HL]?[a-zA-Z%])?/g,
    (all, flags: string, width?: string, prec?: string, conv?: string) => {
      if (conv === undefined) return all; // a trailing lone `%`
      if (conv === "%") return "%";
      const value = directive(ctx, name, st, conv);
      return pad(value, flags, width ? Number(width) : undefined, prec ? Number(prec) : undefined);
    },
  );
}

const ESCAPES: Record<string, string> = {
  n: "\n",
  t: "\t",
  "\\": "\\",
  '"': '"',
  a: "\x07",
  b: "\b",
  f: "\f",
  r: "\r",
  v: "\v",
};

function printfEscapes(s: string): string {
  return s.replace(/\\(.)/g, (all, c: string) => ESCAPES[c] ?? all);
}

export const stat: CommandSpec = {
  name: "stat",
  summary: "show file details (-c FORMAT, e.g. '%a %n')",
  run(ctx) {
    const parsed = parseOptions(ctx, {
      values: "c",
      long: {
        format: { key: "c", value: true },
        printf: { key: "printf", value: true },
      },
    });
    if (!parsed) return 2;
    if (parsed.operands.length === 0) return usageError(ctx, "missing operand");

    const printf = parsed.values.get("printf");
    const cFormat = parsed.values.get("c");
    const format =
      printf !== undefined
        ? printfEscapes(printf)
        : cFormat !== undefined
          ? `${cFormat}\n`
          : DEFAULT_FORMAT;

    let code = 0;
    for (const operand of parsed.operands) {
      const r = tryStat(ctx.vfs, operand);
      if (!r.ok) {
        ctx.stderr.write(`stat: cannot statx ${quoteAlways(operand)}: ${r.error.message}\n`);
        code = 1;
        continue;
      }
      ctx.stdout.write(formatStat(ctx, format, operand, r.stat));
    }
    return code;
  },
};
