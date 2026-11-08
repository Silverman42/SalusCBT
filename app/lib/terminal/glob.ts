// Bash-style pathname expansion against the lab VFS (T-702).
//
// `*`, `?` and bracket expressions (`[abc]`, `[a-z]`, `[!x]`, `[^x]`,
// `[[:digit:]]`) are active only where the user left them unquoted, so each
// pattern character carries an `active` flag. Like bash (5.2, default
// options): a leading `.` must be matched literally, `.`/`..` never match,
// results are sorted, and a pattern with no match is left as typed.
//
// The matcher is a hand-written backtracking loop (no RegExp built from user
// input) and expansion is capped, so a pattern can't blow up the tab.

import type { Vfs } from "./vfs";

/** One pattern character; `active` = unquoted, so `*?[` are special. */
export interface PatternChar {
  ch: string;
  active: boolean;
}

export class GlobLimitError extends Error {
  constructor(readonly limit: number) {
    super(`too many matches (the lab limit is ${limit})`);
    this.name = "GlobLimitError";
  }
}

const CLASSES: Record<string, (c: string) => boolean> = {
  alpha: (c) => /[A-Za-z]/.test(c),
  digit: (c) => /[0-9]/.test(c),
  alnum: (c) => /[A-Za-z0-9]/.test(c),
  upper: (c) => /[A-Z]/.test(c),
  lower: (c) => /[a-z]/.test(c),
  space: (c) => /\s/.test(c),
  punct: (c) => /[!-/:-@[-`{-~]/.test(c),
  xdigit: (c) => /[0-9A-Fa-f]/.test(c),
};

type Atom =
  | { t: "lit"; ch: string }
  | { t: "any" }
  | { t: "star" }
  | { t: "set"; negate: boolean; test: (c: string) => boolean };

/** True if any unquoted `*`, `?` or `[` would make this a glob. */
export function hasGlob(pattern: readonly PatternChar[]): boolean {
  return pattern.some((p) => p.active && (p.ch === "*" || p.ch === "?" || p.ch === "["));
}

/** Parse a bracket expression starting at `[` (index i). Undefined if unterminated. */
function parseSet(p: readonly PatternChar[], i: number): { atom: Atom; end: number } | undefined {
  let j = i + 1;
  let negate = false;
  if (p[j]?.active && (p[j]!.ch === "!" || p[j]!.ch === "^")) {
    negate = true;
    j++;
  }
  const tests: ((c: string) => boolean)[] = [];
  let first = true;
  while (j < p.length) {
    const c = p[j]!;
    if (c.ch === "]" && c.active && !first) {
      const atom: Atom = { t: "set", negate, test: (x) => tests.some((f) => f(x)) };
      return { atom, end: j + 1 };
    }
    first = false;
    if (c.ch === "[" && c.active && p[j + 1]?.ch === ":") {
      const rest = p
        .slice(j + 2)
        .map((x) => x.ch)
        .join("");
      const m = /^([a-z]+):\]/.exec(rest);
      const cls = m ? CLASSES[m[1]!] : undefined;
      if (m && cls) {
        tests.push(cls);
        j += 2 + m[0].length;
        continue;
      }
    }
    const lo = c.ch;
    if (p[j + 1]?.ch === "-" && p[j + 1]!.active && p[j + 2] && p[j + 2]!.ch !== "]") {
      const hi = p[j + 2]!.ch;
      tests.push((x) => x >= lo && x <= hi);
      j += 3;
    } else {
      tests.push((x) => x === lo);
      j++;
    }
  }
  return undefined;
}

function compile(p: readonly PatternChar[]): Atom[] {
  const atoms: Atom[] = [];
  for (let i = 0; i < p.length;) {
    const c = p[i]!;
    if (c.active && c.ch === "*") {
      if (atoms[atoms.length - 1]?.t !== "star") atoms.push({ t: "star" });
      i++;
    } else if (c.active && c.ch === "?") {
      atoms.push({ t: "any" });
      i++;
    } else if (c.active && c.ch === "[") {
      const set = parseSet(p, i);
      if (set) {
        atoms.push(set.atom);
        i = set.end;
      } else {
        atoms.push({ t: "lit", ch: "[" });
        i++;
      }
    } else {
      atoms.push({ t: "lit", ch: c.ch });
      i++;
    }
  }
  return atoms;
}

function matchOne(atom: Atom, c: string): boolean {
  if (atom.t === "lit") return atom.ch === c;
  if (atom.t === "any") return true;
  if (atom.t === "set") return atom.test(c) !== atom.negate;
  return false;
}

/** Match a whole name against compiled atoms (iterative, star backtracking). */
function matchAtoms(atoms: readonly Atom[], name: string): boolean {
  const chars = Array.from(name);
  let a = 0;
  let n = 0;
  let starA = -1;
  let starN = 0;
  while (n < chars.length) {
    const atom = atoms[a];
    if (atom && atom.t !== "star" && matchOne(atom, chars[n]!)) {
      a++;
      n++;
    } else if (atom?.t === "star") {
      starA = a++;
      starN = n;
    } else if (starA >= 0) {
      a = starA + 1;
      n = ++starN;
    } else {
      return false;
    }
  }
  while (atoms[a]?.t === "star") a++;
  return a === atoms.length;
}

/** Does `name` (one path component) match the pattern component? */
export function matchComponent(pattern: readonly PatternChar[], name: string): boolean {
  if (name === "." || name === "..") return false;
  const leadingDot = pattern[0]?.ch === ".";
  if (name.startsWith(".") && !leadingDot) return false;
  return matchAtoms(compile(pattern), name);
}

/** Pattern from plain text with every character active (for tests and helpers). */
export function activePattern(text: string): PatternChar[] {
  return Array.from(text, (ch) => ({ ch, active: true }));
}

function split(pattern: readonly PatternChar[]): PatternChar[][] {
  const parts: PatternChar[][] = [[]];
  for (const c of pattern) {
    if (c.ch === "/") parts.push([]);
    else parts[parts.length - 1]!.push(c);
  }
  return parts;
}

const text = (p: readonly PatternChar[]) => p.map((c) => c.ch).join("");

/**
 * Expand a pattern against the VFS. Returns the sorted matches as the user
 * would see them (relative stays relative), or [] when nothing matches.
 * Throws GlobLimitError past `limit` matches.
 */
export function expandGlob(vfs: Vfs, pattern: readonly PatternChar[], limit: number): string[] {
  const parts = split(pattern);
  const absolute = parts[0]!.length === 0 && parts.length > 1;
  // Trailing `/`: only directories match, and the slash is kept.
  const dirsOnly = parts.length > 1 && parts[parts.length - 1]!.length === 0;
  const comps = parts.filter((p) => p.length > 0);
  let results: string[] = [absolute ? "/" : ""];
  let steps = 0;

  for (const [idx, comp] of comps.entries()) {
    const last = idx === comps.length - 1;
    const next: string[] = [];
    for (const base of results) {
      const join = (name: string) =>
        base === "" ? name : base.endsWith("/") ? base + name : `${base}/${name}`;
      if (!hasGlob(comp)) {
        next.push(join(text(comp)));
        continue;
      }
      const dir = base === "" ? "." : base;
      if (!vfs.isDir(dir)) continue;
      for (const name of vfs.list(dir)) {
        if (++steps > limit * 16) throw new GlobLimitError(limit);
        if (!matchComponent(comp, name)) continue;
        const path = join(name);
        if (!last && !vfs.isDir(path)) continue;
        next.push(path);
        if (next.length > limit) throw new GlobLimitError(limit);
      }
    }
    results = next;
    if (results.length === 0) return [];
  }

  results = results.filter((p) => (dirsOnly ? vfs.isDir(p) : vfs.exists(p)));
  if (dirsOnly) results = results.map((p) => p + "/");
  return results.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
