// Shared helpers for the file commands (T-703): ls, cat, head, tail, stat, chmod.
//
// Output targets GNU coreutils 9.x in the C locale (LC_ALL=C), on ext4, in UTC:
// - names sort by byte order (the VFS and glob order); for the seeded lab tree
//   this is also what en_US.UTF-8 gives, so the lab steps print the same;
// - messages quote with ASCII '…' (a UTF-8 locale would use ‘…’ for some);
// - block counts are ext4's: 4 KiB per started 4 KiB, directories 4 KiB.

import type { CommandContext } from "../command";
import { utf8Length } from "../io";
import { contentBytes, VfsError, type FileContent, type Vfs, type VfsStat } from "../vfs";

// ---------------------------------------------------------------- quoting

const SAFE_NAME = /^[A-Za-z0-9_./+:,%@=^-]+$/;

/**
 * GNU `shell-escape-always` quoting (quoteaf), as in
 * `ls: cannot access 'nope': No such file or directory`.
 */
export function quoteAlways(name: string): string {
  if (!name.includes("'")) return `'${name}'`;
  if (!/[$`"\\!]/.test(name)) return `"${name}"`;
  return `'${name.replace(/'/g, "'\\''")}'`;
}

/** GNU `shell-escape` quoting (quotef): only when the name needs it. */
export function quoteIfNeeded(name: string): string {
  return SAFE_NAME.test(name) && !name.startsWith("~") ? name : quoteAlways(name);
}

/** coreutils `quote()` in the C locale: `'x'`. */
export function quote(text: string): string {
  return `'${text}'`;
}

/** `Try 'chmod --help' for more information.` after a usage error; returns 1. */
export function usageError(ctx: CommandContext, message: string, code = 1): number {
  ctx.stderr.write(`${ctx.name}: ${message}\nTry '${ctx.name} --help' for more information.\n`);
  return code;
}

// ---------------------------------------------------------------- metadata

const EXT4_BLOCK = 4096;

/** 512-byte blocks allocated (`stat %b`): ext4 rounds up to 4 KiB. */
export function blocks512(st: VfsStat): number {
  return Math.ceil(st.size / EXT4_BLOCK) * (EXT4_BLOCK / 512);
}

/** 1 KiB blocks (`ls -l` total, `ls -s`). */
export function blocks1k(st: VfsStat): number {
  return blocks512(st) / 2;
}

/** Hard links: 1 for a file; 2 + subdirectories for a directory. */
export function linkCount(vfs: Vfs, st: VfsStat): number {
  if (st.kind !== "dir") return 1;
  let n = 2;
  for (const name of vfs.list(st.path)) if (vfs.isDir(`${st.path}/${name}`)) n++;
  return n;
}

/** Numeric ids for the lab's users (only root exists in the seeded lab). */
export function idOf(name: string): number {
  return name === "root" ? 0 : 1000;
}

/** stat or undefined + the VfsError (ENOENT, ENOTDIR). */
export function tryStat(
  vfs: Vfs,
  path: string,
): { ok: true; stat: VfsStat } | { ok: false; error: VfsError } {
  try {
    return { ok: true, stat: vfs.stat(path) };
  } catch (err) {
    if (err instanceof VfsError) return { ok: false, error: err };
    throw err;
  }
}

/** A child path for display: `etc` + `ssh` → `etc/ssh`, `/` + `etc` → `/etc`. */
export function joinPath(dir: string, name: string): string {
  return dir.endsWith("/") ? dir + name : `${dir}/${name}`;
}

// ---------------------------------------------------------------- formatting

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * `ls -l` date column, `%b %e %H:%M` in UTC (`Nov  3 09:14`). GNU switches to
 * `%b %e  %Y` for files over six months old; the lab always shows the time,
 * as a freshly built lab does.
 */
export function lsDate(mtime: number): string {
  const d = new Date(mtime);
  const day = String(d.getUTCDate()).padStart(2, " ");
  return `${MONTHS[d.getUTCMonth()]} ${day} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

/** `stat` timestamp: `2026-11-03 09:14:00.000000000 +0000`. */
export function statDate(ms: number): string {
  const d = new Date(ms);
  const nanos = String(d.getUTCMilliseconds() * 1_000_000).padStart(9, "0");
  return (
    `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ` +
    `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}.${nanos} +0000`
  );
}

const UNITS = "KMGTPE";

/** GNU `-h` sizes: 1023, 4.0K, 2.1M (rounded up, one decimal below 10). */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return String(bytes);
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  if (value < 10) {
    const r = Math.ceil(value * 10 - 1e-9) / 10;
    if (r < 10) return `${r.toFixed(1)}${UNITS[unit]}`;
    value = r;
  }
  const r = Math.ceil(value - 1e-9);
  if (r >= 1024 && unit < UNITS.length - 1) return `1.0${UNITS[unit + 1]}`;
  return `${r}${UNITS[unit]}`;
}

// ---------------------------------------------------------------- content

const NL = 0x0a;

/** Byte length of stored content. */
export function byteLength(content: FileContent): number {
  return typeof content === "string" ? utf8Length(content) : content.length;
}

/**
 * Split content into lines, each keeping its `\n` (the last may lack one).
 * Strings stay strings and bytes stay bytes, so binaries pass through intact.
 */
export function splitLines(content: FileContent): FileContent[] {
  const out: FileContent[] = [];
  if (typeof content === "string") {
    let start = 0;
    for (let i = content.indexOf("\n"); i >= 0; i = content.indexOf("\n", start)) {
      out.push(content.slice(start, i + 1));
      start = i + 1;
    }
    if (start < content.length) out.push(content.slice(start));
    return out;
  }
  let start = 0;
  for (let i = content.indexOf(NL); i >= 0; i = content.indexOf(NL, start)) {
    out.push(content.subarray(start, i + 1));
    start = i + 1;
  }
  if (start < content.length) out.push(content.subarray(start));
  return out;
}

/** Join pieces from splitLines back into one content value. */
export function joinContent(parts: readonly FileContent[]): FileContent {
  if (parts.every((p) => typeof p === "string")) return parts.join("");
  const bytes = parts.map(contentBytes);
  const out = new Uint8Array(bytes.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const b of bytes) {
    out.set(b, at);
    at += b.length;
  }
  return out;
}

function isAscii(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0x7f) return false;
  return true;
}

/** Bytes `[start, end)` of the content (end defaults to the end). */
export function sliceBytes(content: FileContent, start: number, end?: number): FileContent {
  if (typeof content === "string" && isAscii(content)) return content.slice(start, end);
  return contentBytes(content).subarray(start, end);
}
