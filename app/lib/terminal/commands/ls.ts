// ls for the terminal lab (T-703, LLD §13.2, LB-2). GNU coreutils 9.x output
// in the C locale (see fileUtil.ts):
//
//   ls -l   total 20
//           -rw-r--r-- 1 root root  414 Nov  3 09:14 group
//           drwxr-xr-x 2 root root 4096 Nov  3 09:14 ssh
//
// Flags: -a -A -d -l -h -1 -C -r -t -S. On the screen plain `ls` prints
// columns (80 wide, or $COLUMNS); into a pipe or file, one name per line.
// Missing operands: `ls: cannot access 'x': No such file or directory`, status 2.

import { parseOptions, type CommandContext, type CommandSpec } from "../command";
import { formatMode, type VfsStat } from "../vfs";
import { blocks1k, humanSize, joinPath, linkCount, lsDate, quoteAlways, tryStat } from "./fileUtil";

interface Entry {
  /** Name as shown (operand as typed, or the directory entry's name). */
  name: string;
  stat: VfsStat;
}

interface LsOptions {
  all: boolean;
  almostAll: boolean;
  long: boolean;
  human: boolean;
  columns: boolean;
  reverse: boolean;
  sort: "name" | "time" | "size";
}

const byName = (a: Entry, b: Entry) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

function sortEntries(entries: Entry[], opts: LsOptions): Entry[] {
  const cmp =
    opts.sort === "time"
      ? (a: Entry, b: Entry) => b.stat.mtime - a.stat.mtime || byName(a, b)
      : opts.sort === "size"
        ? (a: Entry, b: Entry) => b.stat.size - a.stat.size || byName(a, b)
        : byName;
  const sorted = [...entries].sort(cmp);
  return opts.reverse ? sorted.reverse() : sorted;
}

function longLines(ctx: CommandContext, entries: Entry[], opts: LsOptions): string[] {
  const rows = entries.map((e) => ({
    mode: formatMode(e.stat.kind, e.stat.mode),
    links: String(linkCount(ctx.vfs, e.stat)),
    owner: e.stat.owner,
    group: e.stat.group,
    size: opts.human ? humanSize(e.stat.size) : String(e.stat.size),
    date: lsDate(e.stat.mtime),
    name: e.name,
  }));
  const w = (key: "links" | "owner" | "group" | "size") =>
    Math.max(0, ...rows.map((r) => r[key].length));
  const [wl, wo, wg, ws] = [w("links"), w("owner"), w("group"), w("size")];
  return rows.map(
    (r) =>
      `${r.mode} ${r.links.padStart(wl)} ${r.owner.padEnd(wo)} ${r.group.padEnd(wg)} ` +
      `${r.size.padStart(ws)} ${r.date} ${r.name}`,
  );
}

/** GNU's vertical column layout (`ls -C`), padded with spaces. */
export function columnLines(names: readonly string[], width: number): string[] {
  const n = names.length;
  if (n === 0) return [];
  const MIN = 3;
  const maxCols = Math.max(1, Math.min(Math.floor(width / MIN), n));
  const lens = names.map((s) => s.length);
  let best = { cols: 1, widths: [Math.max(...lens)] };
  for (let cols = maxCols; cols > 1; cols--) {
    const rows = Math.ceil(n / cols);
    const widths = new Array<number>(cols).fill(MIN);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(i / rows);
      widths[idx] = Math.max(widths[idx]!, lens[i]! + (idx === cols - 1 ? 0 : 2));
    }
    if (widths.reduce((a, b) => a + b, 0) < width) {
      best = { cols, widths };
      break;
    }
  }
  const rows = Math.ceil(n / best.cols);
  const out: string[] = [];
  for (let row = 0; row < rows; row++) {
    let line = "";
    for (let i = row, col = 0; i < n; i += rows, col++) {
      const last = i + rows >= n;
      line += last ? names[i] : names[i]!.padEnd(best.widths[col]!);
    }
    out.push(line);
  }
  return out;
}

function listing(ctx: CommandContext, entries: Entry[], opts: LsOptions): string[] {
  const sorted = sortEntries(entries, opts);
  if (opts.long) return longLines(ctx, sorted, opts);
  const names = sorted.map((e) => e.name);
  if (!opts.columns) return names;
  const width = Number(ctx.env.get("COLUMNS")) || 80;
  return columnLines(names, width);
}

/** Entries of a directory, with `.` and `..` for -a. */
function dirEntries(ctx: CommandContext, dir: VfsStat, opts: LsOptions): Entry[] {
  const out: Entry[] = [];
  if (opts.all) {
    out.push({ name: ".", stat: dir });
    out.push({ name: "..", stat: ctx.vfs.stat(joinPath(dir.path, "..")) });
  }
  for (const name of ctx.vfs.list(dir.path)) {
    if (name.startsWith(".") && !opts.all && !opts.almostAll) continue;
    out.push({ name, stat: ctx.vfs.stat(joinPath(dir.path, name)) });
  }
  return out;
}

export const ls: CommandSpec = {
  name: "ls",
  summary: "list files (-l -a -A -d -h -1 -r -t -S)",
  run(ctx) {
    const parsed = parseOptions(ctx, {
      flags: "aAdlh1CrtS",
      long: {
        all: { key: "a" },
        "almost-all": { key: "A" },
        directory: { key: "d" },
        "human-readable": { key: "h" },
        reverse: { key: "r" },
      },
    });
    if (!parsed) return 2;
    const f = parsed.flags;
    // -l wins over -C; -1 over the screen's default columns.
    const columns = !f.has("l") && (f.has("C") || (!f.has("1") && ctx.stdout.isTerminal === true));
    const opts: LsOptions = {
      all: f.has("a"),
      almostAll: f.has("A"),
      long: f.has("l"),
      human: f.has("h"),
      columns,
      reverse: f.has("r"),
      sort: f.has("S") ? "size" : f.has("t") ? "time" : "name",
    };

    const operands = parsed.operands.length > 0 ? parsed.operands : ["."];
    let code = 0;
    const files: Entry[] = [];
    const dirs: Entry[] = [];
    for (const operand of operands) {
      const r = tryStat(ctx.vfs, operand);
      if (!r.ok) {
        ctx.stderr.write(`ls: cannot access ${quoteAlways(operand)}: ${r.error.message}\n`);
        code = 2;
        continue;
      }
      const entry = { name: operand, stat: r.stat };
      (r.stat.kind === "dir" && !f.has("d") ? dirs : files).push(entry);
    }

    const blocks: string[][] = [];
    if (files.length > 0) blocks.push(listing(ctx, files, opts));
    const headers = files.length > 0 || operands.length > 1;
    for (const dir of sortEntries(dirs, opts)) {
      const entries = dirEntries(ctx, dir.stat, opts);
      const lines = headers ? [`${dir.name}:`] : [];
      if (opts.long) {
        const total = entries.reduce((n, e) => n + blocks1k(e.stat), 0);
        lines.push(`total ${opts.human ? humanSize(total * 1024) : total}`);
      }
      lines.push(...listing(ctx, entries, opts));
      blocks.push(lines);
    }
    const text = blocks.map((b) => b.map((l) => `${l}\n`).join("")).join("\n");
    ctx.stdout.write(text);
    return code;
  },
};
