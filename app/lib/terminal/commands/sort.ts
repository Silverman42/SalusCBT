// sort (T-704, LB-2). GNU coreutils 9.x semantics with byte-order (C locale)
// comparison: -n numeric, -r reverse, -u unique, -f fold case, -b ignore
// leading blanks, -s stable, -t SEP, -k POS1[,POS2] with per-key options.
// Lines that compare equal fall back to a whole-line byte comparison (also
// reversed by -r) unless -s or -u is given, as GNU does.

import { fail, type CommandContext, type CommandSpec } from "../command";
import { lastValue, parseOpts, readInput, splitLines, textOf } from "./textUtil";

interface KeyOpts {
  n: boolean;
  r: boolean;
  f: boolean;
  /** skip leading blanks at the start / end position */
  bs: boolean;
  be: boolean;
}

interface Key extends KeyOpts {
  /** 0-based field and char offset of the start. */
  sword: number;
  schar: number;
  /** 0-based end field (-1: end of line) and 1-based end char (0: end of field). */
  eword: number;
  echar: number;
}

const isBlank = (c: number) => c === 32 || c === 9;

class BadSpec extends Error {}

function parseKey(spec: string, global: KeyOpts): Key {
  let i = 0;
  const bad = (msg: string): never => {
    throw new BadSpec(`${msg}: invalid field specification '${spec}'`);
  };
  const number = (what: string): number => {
    const m = /^\d+/.exec(spec.slice(i));
    if (!m)
      throw new BadSpec(`invalid number ${what}: invalid count at start of '${spec.slice(i)}'`);
    i += m[0].length;
    return Number(m[0]);
  };
  const local: KeyOpts = { n: false, r: false, f: false, bs: false, be: false };
  let any = false;
  const options = (end: boolean) => {
    while (i < spec.length && spec[i] !== ",") {
      const c = spec[i]!;
      if (c === "n") local.n = true;
      else if (c === "r") local.r = true;
      else if (c === "f") local.f = true;
      else if (c === "b") {
        if (end) local.be = true;
        else local.bs = true;
      } else if ("dghiMRV".includes(c)) {
        throw new BadSpec(`the '${c}' key option is not available in this lab`);
      } else bad("stray character in field spec");
      any = true;
      i++;
    }
  };

  const sword = number("at field start");
  if (sword === 0) bad("field number is zero");
  let schar = 1;
  if (spec[i] === ".") {
    i++;
    schar = number("after '.'");
    if (schar === 0) bad("character offset is zero");
  }
  options(false);
  let eword = -1;
  let echar = 0;
  if (spec[i] === ",") {
    i++;
    eword = number("after ','");
    if (eword === 0) bad("field number is zero");
    eword--;
    if (spec[i] === ".") {
      i++;
      echar = number("after '.'");
    }
    options(true);
  }
  const o = any ? local : global;
  return { ...o, sword: sword - 1, schar: schar - 1, eword, echar };
}

/** GNU begfield/limfield: [start, end) of a key in `line`. */
function keySpan(line: string, key: Key, tab: number | undefined): [number, number] {
  const lim = line.length;
  let p = 0;
  for (let w = key.sword; p < lim && w > 0; w--) {
    if (tab !== undefined) {
      while (p < lim && line.charCodeAt(p) !== tab) p++;
      if (p < lim) p++;
    } else {
      while (p < lim && isBlank(line.charCodeAt(p))) p++;
      while (p < lim && !isBlank(line.charCodeAt(p))) p++;
    }
  }
  if (key.bs) while (p < lim && isBlank(line.charCodeAt(p))) p++;
  const start = Math.min(lim, p + key.schar);

  let end = lim;
  if (key.eword >= 0) {
    let q = 0;
    let eword = key.echar === 0 ? key.eword + 1 : key.eword;
    if (tab !== undefined) {
      while (q < lim && eword-- > 0) {
        while (q < lim && line.charCodeAt(q) !== tab) q++;
        if (q < lim && (eword > 0 || key.echar !== 0)) q++;
      }
    } else {
      while (q < lim && eword-- > 0) {
        while (q < lim && isBlank(line.charCodeAt(q))) q++;
        while (q < lim && !isBlank(line.charCodeAt(q))) q++;
      }
    }
    if (key.echar !== 0) {
      if (key.be) while (q < lim && isBlank(line.charCodeAt(q))) q++;
      q = Math.min(lim, q + key.echar);
    }
    end = q;
  }
  return [start, Math.max(start, end)];
}

/** GNU -n: leading blanks, optional '-', digits, optional fraction; else 0. */
function numericValue(s: string): number {
  const m = /^[ \t]*(-?(?:\d+(?:\.\d*)?|\.\d+))/.exec(s);
  if (!m) return 0;
  const v = Number(m[1]);
  return Number.isNaN(v) ? 0 : v;
}

const byteCompare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function sort(ctx: CommandContext): number {
  const opts = parseOpts(ctx, {
    flags: "nrufbs",
    values: "kt",
    long: {
      "numeric-sort": { key: "n" },
      reverse: { key: "r" },
      unique: { key: "u" },
      "ignore-case": { key: "f" },
      "ignore-leading-blanks": { key: "b" },
      stable: { key: "s" },
      key: { key: "k", value: true },
      "field-separator": { key: "t", value: true },
    },
  });
  if (!opts) return 2;
  const f = opts.flags;
  const global: KeyOpts = {
    n: f.has("n"),
    r: f.has("r"),
    f: f.has("f"),
    bs: f.has("b"),
    be: f.has("b"),
  };

  let tab: number | undefined;
  const t = lastValue(opts, "t");
  if (t !== undefined) {
    if (t === "") return fail(ctx, "empty tab", 2);
    if (t.length > 1 && t !== "\\0") return fail(ctx, `multi-character tab '${t}'`, 2);
    tab = t === "\\0" ? 0 : t.charCodeAt(0);
  }

  let keys: Key[];
  try {
    keys = (opts.values.get("k") ?? []).map((k) => parseKey(k, global));
  } catch (e) {
    if (e instanceof BadSpec) return fail(ctx, e.message, 2);
    throw e;
  }
  const noKeys = keys.length === 0;
  if (noKeys) keys = [{ ...global, sword: 0, schar: 0, eword: -1, echar: 0 }];

  const lines: string[] = [];
  for (const file of opts.operands.length > 0 ? opts.operands : ["-"]) {
    const read = readInput(ctx, file);
    if (!read.ok) {
      const what = read.error.code === "EISDIR" ? "read failed" : "cannot read";
      return fail(ctx, `${what}: ${file}: ${read.error.message}`, 2);
    }
    for (const l of splitLines(textOf(read.content))) lines.push(l);
  }

  const compareKeys = (a: string, b: string): number => {
    for (const key of keys) {
      let ka: string;
      let kb: string;
      if (noKeys && !key.bs) {
        ka = a;
        kb = b;
      } else {
        const [as, ae] = keySpan(a, key, tab);
        const [bs, be] = keySpan(b, key, tab);
        ka = a.slice(as, ae);
        kb = b.slice(bs, be);
      }
      let c: number;
      if (key.n) c = Math.sign(numericValue(ka) - numericValue(kb));
      else if (key.f) c = byteCompare(ka.toUpperCase(), kb.toUpperCase());
      else c = byteCompare(ka, kb);
      if (c !== 0) return key.r ? -c : c;
    }
    return 0;
  };
  const lastResort = !f.has("s") && !f.has("u");
  const compare = (a: string, b: string): number => {
    const c = compareKeys(a, b);
    if (c !== 0 || !lastResort) return c;
    const d = byteCompare(a, b);
    return f.has("r") ? -d : d;
  };

  lines.sort(compare);
  const out: string[] = [];
  let prev: string | undefined;
  for (const line of lines) {
    if (f.has("u") && prev !== undefined && compareKeys(prev, line) === 0) continue;
    prev = line;
    out.push(line);
  }
  if (out.length > 0) ctx.stdout.write(out.join("\n") + "\n");
  return 0;
}

export const sortCommand: CommandSpec = {
  name: "sort",
  summary: "sort lines (-n -r -u -f -k N -t SEP)",
  run: sort,
};
