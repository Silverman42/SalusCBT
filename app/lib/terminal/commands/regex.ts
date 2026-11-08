// POSIX regular expressions for grep, sed and awk in the terminal lab (T-704).
//
// Student input never reaches the browser's backtracking RegExp engine.
// Patterns are parsed here (GNU BRE for grep/sed, ERE for grep -E, sed -E and
// awk), compiled to a small NFA program and run with a Pike VM: every search
// is O(text × program), the program size is capped, and every command shares
// a step budget, so no pattern can hang the tab. The VM finds the POSIX
// leftmost-longest match, as GNU grep and sed do, which matters for `grep -o`
// and `sed s///`. Sub-match positions (sed `\1`) follow the leftmost-first
// priority among the longest matches; POSIX's sub-match rules differ only in
// rare ambiguous cases.
//
// Not supported: back-references (`\1` in a pattern) cannot run in an NFA and
// print "not available in this lab"; collating elements beyond one character.

export class RegexSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegexSyntaxError";
  }
}

/** A feature the lab leaves out (LB-3). `feature` reads "back-references". */
export class RegexUnsupportedError extends Error {
  constructor(readonly feature: string) {
    super(`${feature} are not available in this lab`);
    this.name = "RegexUnsupportedError";
  }
}

/** The step budget ran out. */
export class RegexLimitError extends Error {
  constructor() {
    super("regular expression too complex for the lab");
    this.name = "RegexLimitError";
  }
}

/** Shared by every regex one command runs. */
export interface RegexBudget {
  used: number;
  limit: number;
}

/** About 1–2 s of work in a browser; the lab's files need well under 1% of it. */
export const DEFAULT_REGEX_STEPS = 60_000_000;

export function newBudget(limit = DEFAULT_REGEX_STEPS): RegexBudget {
  return { used: 0, limit };
}

/** Program size cap (instructions), so `(a{999}){999}` is refused, not built. */
const MAX_PROGRAM = 40_000;
/** RE_DUP_MAX in glibc. */
const DUP_MAX = 32767;

// ------------------------------------------------------------------ AST

type AssertKind = "bol" | "eol" | "wb" | "nwb" | "wstart" | "wend" | "nwbefore" | "nwafter";

export type RegexNode =
  | { t: "char"; c: number }
  | { t: "any" }
  | { t: "set"; neg: boolean; test: (c: number) => boolean }
  | { t: "assert"; k: AssertKind }
  | { t: "group"; n: number; body: RegexNode }
  | { t: "cat"; items: RegexNode[] }
  | { t: "alt"; items: RegexNode[] }
  | { t: "rep"; body: RegexNode; min: number; max: number };

export interface ParsedRegex {
  node: RegexNode;
  /** Number of capture groups. */
  groups: number;
}

export interface ParseOptions {
  extended: boolean;
  /** awk: `\t`, `\n`, `\/` … are escapes, and `\` escapes inside brackets. */
  awk?: boolean;
  /** grep: collects "stray \ before x" style warnings. */
  warnings?: string[];
  /** grep: `[:space:]` (not inside brackets) is an error. */
  strictClass?: boolean;
}

// ------------------------------------------------------------------ chars

const isAsciiWord = (c: number) =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export function isWordChar(c: number): boolean {
  if (c < 0) return false;
  if (c < 128) return isAsciiWord(c);
  return LETTER_OR_DIGIT.test(String.fromCodePoint(c));
}

const isSpace = (c: number) => c === 32 || (c >= 9 && c <= 13);

function charTest(re: RegExp): (c: number) => boolean {
  return (c) => re.test(String.fromCodePoint(c));
}

const CLASSES: Record<string, (c: number) => boolean> = {
  alpha: charTest(/\p{L}/u),
  digit: (c) => c >= 48 && c <= 57,
  alnum: (c) => (c >= 48 && c <= 57) || LETTER_OR_DIGIT.test(String.fromCodePoint(c)),
  upper: charTest(/\p{Lu}/u),
  lower: charTest(/\p{Ll}/u),
  space: isSpace,
  blank: (c) => c === 32 || c === 9,
  punct: (c) =>
    (c >= 33 && c <= 47) || (c >= 58 && c <= 64) || (c >= 91 && c <= 96) || (c >= 123 && c <= 126),
  print: (c) => c >= 32 && c !== 127 && !(c >= 128 && c < 160),
  graph: (c) => c > 32 && c !== 127 && !(c >= 128 && c <= 160),
  cntrl: (c) => c < 32 || c === 127,
  xdigit: (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102),
};

function lowerOf(c: number): number {
  const s = String.fromCodePoint(c).toLowerCase();
  const l = s.codePointAt(0)!;
  return s.length === String.fromCodePoint(l).length ? l : c;
}

function upperOf(c: number): number {
  const s = String.fromCodePoint(c).toUpperCase();
  const u = s.codePointAt(0)!;
  return s.length === String.fromCodePoint(u).length ? u : c;
}

// ------------------------------------------------------------------ parser

const UNMATCHED_BRACKET = "Unmatched [, [^, [:, [., or [=";

class Parser {
  private readonly cps: number[];
  private i = 0;
  groups = 0;

  constructor(
    pattern: string,
    private readonly opts: ParseOptions,
  ) {
    this.cps = Array.from(pattern, (ch) => ch.codePointAt(0)!);
  }

  parse(): RegexNode {
    const node = this.parseAlt(0);
    if (this.i < this.cps.length) {
      // Only a stray close-group stops parseAlt at depth 0.
      throw new RegexSyntaxError("Unmatched ) or \\)");
    }
    return node;
  }

  private peek(k = 0): number {
    return this.cps[this.i + k] ?? -1;
  }

  private ch(k = 0): string {
    const c = this.peek(k);
    return c < 0 ? "" : String.fromCodePoint(c);
  }

  private atAlt(): boolean {
    if (this.opts.extended) return this.ch() === "|";
    return this.ch() === "\\" && this.ch(1) === "|";
  }

  private atClose(): boolean {
    if (this.opts.extended) return this.ch() === ")";
    return this.ch() === "\\" && this.ch(1) === ")";
  }

  private parseAlt(depth: number): RegexNode {
    const items = [this.parseCat(depth)];
    while (this.atAlt()) {
      this.i += this.opts.extended ? 1 : 2;
      items.push(this.parseCat(depth));
    }
    return items.length === 1 ? items[0]! : { t: "alt", items };
  }

  private parseCat(depth: number): RegexNode {
    const items: RegexNode[] = [];
    const ext = this.opts.extended;
    for (;;) {
      if (this.i >= this.cps.length || this.atAlt()) break;
      if (this.atClose()) {
        if (depth === 0) throw new RegexSyntaxError("Unmatched ) or \\)");
        break;
      }
      const start =
        items.length === 0 ||
        (items.length === 1 && items[0]!.t === "assert" && items[0]!.k === "bol");
      const c = this.ch();
      if (ext && start && (c === "*" || c === "+" || c === "?")) {
        // GNU ERE ignores a repetition operator with nothing to repeat.
        this.opts.warnings?.push(`${c} at start of expression`);
        this.i++;
        continue;
      }
      let atom = this.parseAtom(start, depth);
      // BRE: `*` right after a leading `^` is a literal (handled next round).
      if (ext || !(atom.t === "assert" && atom.k === "bol")) atom = this.parseQuantifiers(atom);
      items.push(atom);
    }
    return items.length === 1 ? items[0]! : { t: "cat", items };
  }

  private parseQuantifiers(atom: RegexNode): RegexNode {
    const ext = this.opts.extended;
    for (;;) {
      const c = this.ch();
      if (c === "*") {
        this.i++;
        atom = { t: "rep", body: atom, min: 0, max: -1 };
      } else if (ext && (c === "+" || c === "?")) {
        this.i++;
        atom = { t: "rep", body: atom, min: c === "+" ? 1 : 0, max: c === "+" ? -1 : 1 };
      } else if (!ext && c === "\\" && (this.ch(1) === "+" || this.ch(1) === "?")) {
        const plus = this.ch(1) === "+";
        this.i += 2;
        atom = { t: "rep", body: atom, min: plus ? 1 : 0, max: plus ? -1 : 1 };
      } else if (ext && c === "{") {
        const iv = this.parseInterval(this.i + 1, false);
        if (!iv) return atom; // not an interval: `{` is a literal
        this.i = iv.end;
        atom = { t: "rep", body: atom, min: iv.min, max: iv.max };
      } else if (!ext && c === "\\" && this.ch(1) === "{") {
        const iv = this.parseInterval(this.i + 2, true);
        this.i = iv!.end;
        atom = { t: "rep", body: atom, min: iv!.min, max: iv!.max };
      } else {
        return atom;
      }
    }
  }

  /** `{m}`, `{m,}`, `{,n}`, `{m,n}` from `at` (after the brace). */
  private parseInterval(
    at: number,
    basic: boolean,
  ): { min: number; max: number; end: number } | undefined {
    let j = at;
    const num = (): number | undefined => {
      let s = "";
      while (j < this.cps.length && this.cps[j]! >= 48 && this.cps[j]! <= 57) {
        s += String.fromCodePoint(this.cps[j]!);
        j++;
      }
      return s === "" ? undefined : Number(s);
    };
    const min = num();
    let max: number | undefined = min;
    let comma = false;
    if (this.cps[j] === 44) {
      comma = true;
      j++;
      max = num();
    }
    const closeLen = basic ? 2 : 1;
    const closed = basic ? this.cps[j] === 92 && this.cps[j + 1] === 125 : this.cps[j] === 125;
    if (!closed) {
      if (!basic) return undefined;
      // Distinguish a missing `\}` from junk inside the braces.
      for (let k = j; k < this.cps.length - 1; k++) {
        if (this.cps[k] === 92 && this.cps[k + 1] === 125) {
          throw new RegexSyntaxError("Invalid content of \\{\\}");
        }
      }
      throw new RegexSyntaxError("Unmatched \\{");
    }
    if (min === undefined && !comma) {
      if (!basic) return undefined;
      throw new RegexSyntaxError("Invalid content of \\{\\}");
    }
    const lo = min ?? 0;
    const hi = comma && max === undefined ? -1 : max!;
    if (lo > DUP_MAX || hi > DUP_MAX) throw new RegexSyntaxError("Regular expression too big");
    if (hi !== -1 && hi < lo) throw new RegexSyntaxError("Invalid content of \\{\\}");
    return { min: lo, max: hi, end: j + closeLen };
  }

  private parseAtom(start: boolean, depth: number): RegexNode {
    const ext = this.opts.extended;
    const c = this.ch();
    if (c === "(" && ext) {
      this.i++;
      return this.group(depth);
    }
    if (c === ".") {
      this.i++;
      return { t: "any" };
    }
    if (c === "[") {
      this.i++;
      return this.bracket();
    }
    if (c === "^") {
      this.i++;
      if (ext || start) return { t: "assert", k: "bol" };
      return { t: "char", c: 94 };
    }
    if (c === "$") {
      this.i++;
      if (ext || this.i >= this.cps.length || this.atClose() || this.atAlt()) {
        return { t: "assert", k: "eol" };
      }
      return { t: "char", c: 36 };
    }
    if (c === "*" && !ext && start) {
      this.i++;
      return { t: "char", c: 42 };
    }
    if (c === "\\") return this.escape(start, depth);
    this.i++;
    return { t: "char", c: this.cps[this.i - 1]! };
  }

  private group(depth: number): RegexNode {
    const n = ++this.groups;
    const body = this.parseAlt(depth + 1);
    if (!this.atClose()) throw new RegexSyntaxError("Unmatched ( or \\(");
    this.i += this.opts.extended ? 1 : 2;
    return { t: "group", n, body };
  }

  private escape(start: boolean, depth: number): RegexNode {
    const ext = this.opts.extended;
    this.i++; // the backslash
    if (this.i >= this.cps.length) throw new RegexSyntaxError("Trailing backslash");
    const c = this.ch();
    const code = this.peek();
    this.i++;
    if (!ext) {
      if (c === "(") return this.group(depth);
      if (c === "{") {
        if (start) throw new RegexSyntaxError("Invalid preceding regular expression");
      }
      if ((c === "+" || c === "?") && start) return { t: "char", c: code };
    }
    if (c >= "1" && c <= "9") throw new RegexUnsupportedError("back-references");
    if (this.opts.awk) {
      const esc = AWK_ESCAPES[c];
      if (esc !== undefined) return { t: "char", c: esc };
      if (c >= "0" && c <= "7") return { t: "char", c: this.octal(code) };
      if (c === "y") return { t: "assert", k: "wb" };
    }
    switch (c) {
      case "<":
        return { t: "assert", k: "wstart" };
      case ">":
        return { t: "assert", k: "wend" };
      case "b":
        return { t: "assert", k: "wb" };
      case "B":
        return { t: "assert", k: "nwb" };
      case "`":
        return { t: "assert", k: "bol" };
      case "'":
        return { t: "assert", k: "eol" };
      case "w":
        return { t: "set", neg: false, test: isWordChar };
      case "W":
        return { t: "set", neg: true, test: isWordChar };
      case "s":
        return { t: "set", neg: false, test: isSpace };
      case "S":
        return { t: "set", neg: true, test: isSpace };
    }
    const special = ext ? ".[]*^$\\+?(){}|" : ".[]*^$\\";
    if (!special.includes(c) && !this.opts.awk) {
      this.opts.warnings?.push(
        isSpace(code) ? "stray \\ before white space" : `stray \\ before ${c}`,
      );
    }
    return { t: "char", c: code };
  }

  /** `\ddd` in awk; `first` is the first digit, already consumed. */
  private octal(first: number): number {
    let v = first - 48;
    for (let k = 0; k < 2 && this.peek() >= 48 && this.peek() <= 55; k++) {
      v = v * 8 + (this.peek() - 48);
      this.i++;
    }
    return v;
  }

  private bracket(): RegexNode {
    const openAt = this.i;
    let neg = false;
    if (this.ch() === "^") {
      neg = true;
      this.i++;
    }
    const ranges: number[] = [];
    const preds: ((c: number) => boolean)[] = [];
    let first = true;
    for (;;) {
      if (this.i >= this.cps.length) throw new RegexSyntaxError(UNMATCHED_BRACKET);
      const c = this.ch();
      if (c === "]" && !first) {
        this.i++;
        break;
      }
      first = false;
      const lo = this.bracketChar(preds);
      if (lo === undefined) continue; // a [:class:]
      if (this.ch() === "-" && this.ch(1) !== "]" && this.i + 1 < this.cps.length) {
        this.i++;
        const hi = this.bracketChar(undefined);
        if (hi === undefined || hi < lo) throw new RegexSyntaxError("Invalid range end");
        ranges.push(lo, hi);
      } else {
        ranges.push(lo, lo);
      }
    }
    if (this.opts.strictClass && !neg) {
      const inner = this.cps.slice(openAt, this.i - 1);
      if (inner.length >= 2 && inner[0] === 58 && inner[inner.length - 1] === 58) {
        const name = String.fromCodePoint(...inner.slice(1, -1));
        throw new RegexSyntaxError(`character class syntax is [[:${name}:]], not [:${name}:]`);
      }
    }
    const test = (cp: number) => {
      for (let k = 0; k < ranges.length; k += 2) {
        if (cp >= ranges[k]! && cp <= ranges[k + 1]!) return true;
      }
      for (const p of preds) if (p(cp)) return true;
      return false;
    };
    return { t: "set", neg, test };
  }

  /** One bracket item: a char (returned) or a [:class:] (pushed to preds). */
  private bracketChar(preds: ((c: number) => boolean)[] | undefined): number | undefined {
    const c = this.ch();
    if (c === "[" && (this.ch(1) === ":" || this.ch(1) === "." || this.ch(1) === "=")) {
      const kind = this.ch(1);
      let j = this.i + 2;
      while (
        j + 1 < this.cps.length &&
        !(this.cps[j] === kind.codePointAt(0) && this.cps[j + 1] === 93)
      ) {
        j++;
      }
      if (j + 1 >= this.cps.length) throw new RegexSyntaxError(UNMATCHED_BRACKET);
      const name = String.fromCodePoint(...this.cps.slice(this.i + 2, j));
      this.i = j + 2;
      if (kind === ":") {
        const pred = CLASSES[name];
        if (!pred || !preds) throw new RegexSyntaxError("Invalid character class name");
        preds.push(pred);
        return undefined;
      }
      const chars = Array.from(name);
      if (chars.length !== 1) throw new RegexSyntaxError("Invalid collation character");
      return chars[0]!.codePointAt(0)!;
    }
    if (c === "\\" && this.opts.awk && this.i + 1 < this.cps.length) {
      this.i += 2;
      const e = this.ch(-1);
      const esc = AWK_ESCAPES[e];
      if (esc !== undefined) return esc;
      return this.cps[this.i - 1]!;
    }
    this.i++;
    return this.cps[this.i - 1]!;
  }
}

const AWK_ESCAPES: Record<string, number> = {
  n: 10,
  t: 9,
  r: 13,
  f: 12,
  v: 11,
  a: 7,
  "/": 47,
  '"': 34,
};

export function parseRegex(pattern: string, opts: ParseOptions): ParsedRegex {
  const p = new Parser(pattern, opts);
  const node = p.parse();
  return { node, groups: p.groups };
}

/** A node matching `text` literally (grep -F). */
export function literalNode(text: string): RegexNode {
  const items: RegexNode[] = Array.from(text, (ch) => ({ t: "char", c: ch.codePointAt(0)! }));
  return items.length === 1 ? items[0]! : { t: "cat", items };
}

// ------------------------------------------------------------------ compiler

const Op = {
  Char: 0,
  Any: 1,
  Set: 2,
  Assert: 3,
  Split: 4,
  Jmp: 5,
  Save: 6,
  Match: 7,
} as const;
type Op = (typeof Op)[keyof typeof Op];

interface Inst {
  op: Op;
  a: number;
  b: number;
  test?: (c: number) => boolean;
  k?: AssertKind;
}

class Compiler {
  readonly prog: Inst[] = [];

  constructor(private readonly icase: boolean) {}

  private emit(inst: Inst): number {
    if (this.prog.length >= MAX_PROGRAM) throw new RegexSyntaxError("Regular expression too big");
    this.prog.push(inst);
    return this.prog.length - 1;
  }

  compile(n: RegexNode): void {
    switch (n.t) {
      case "char": {
        if (this.icase) {
          const lo = lowerOf(n.c);
          const up = upperOf(n.c);
          this.emit({ op: Op.Char, a: lo, b: up === lo ? n.c : up });
        } else {
          this.emit({ op: Op.Char, a: n.c, b: n.c });
        }
        return;
      }
      case "any":
        this.emit({ op: Op.Any, a: 0, b: 0 });
        return;
      case "set": {
        const base = n.test;
        const inner = this.icase
          ? (c: number) => base(c) || base(lowerOf(c)) || base(upperOf(c))
          : base;
        const test = n.neg ? (c: number) => !inner(c) : inner;
        this.emit({ op: Op.Set, a: 0, b: 0, test });
        return;
      }
      case "assert":
        this.emit({ op: Op.Assert, a: 0, b: 0, k: n.k });
        return;
      case "group":
        this.emit({ op: Op.Save, a: 2 * n.n, b: 0 });
        this.compile(n.body);
        this.emit({ op: Op.Save, a: 2 * n.n + 1, b: 0 });
        return;
      case "cat":
        for (const item of n.items) this.compile(item);
        return;
      case "alt": {
        const jumps: number[] = [];
        n.items.forEach((item, idx) => {
          if (idx < n.items.length - 1) {
            const split = this.emit({ op: Op.Split, a: 0, b: 0 });
            this.prog[split]!.a = this.prog.length;
            this.compile(item);
            jumps.push(this.emit({ op: Op.Jmp, a: 0, b: 0 }));
            this.prog[split]!.b = this.prog.length;
          } else {
            this.compile(item);
          }
        });
        for (const j of jumps) this.prog[j]!.a = this.prog.length;
        return;
      }
      case "rep": {
        const { body, min, max } = n;
        if (max === -1) {
          for (let k = 0; k < min - 1; k++) this.compile(body);
          if (min >= 1) {
            const top = this.prog.length;
            this.compile(body);
            this.emit({ op: Op.Split, a: top, b: this.prog.length + 1 });
          } else {
            const split = this.emit({ op: Op.Split, a: 0, b: 0 });
            this.prog[split]!.a = this.prog.length;
            this.compile(body);
            this.emit({ op: Op.Jmp, a: split, b: 0 });
            this.prog[split]!.b = this.prog.length;
          }
          return;
        }
        for (let k = 0; k < min; k++) this.compile(body);
        const splits: number[] = [];
        for (let k = min; k < max; k++) {
          const split = this.emit({ op: Op.Split, a: 0, b: 0 });
          this.prog[split]!.a = this.prog.length;
          splits.push(split);
          this.compile(body);
        }
        for (const s of splits) this.prog[s]!.b = this.prog.length;
        return;
      }
    }
  }
}

// ------------------------------------------------------------------ VM

export interface RegexMatch {
  start: number;
  end: number;
  /** caps[2n], caps[2n+1]: group n's span (UTF-16 indexes), -1 if unset. */
  caps: number[];
}

interface Thread {
  pc: number;
  caps: number[];
}

function prevCp(s: string, i: number): number {
  if (i <= 0) return -1;
  const c = s.charCodeAt(i - 1);
  if (c >= 0xdc00 && c <= 0xdfff && i >= 2) {
    const h = s.charCodeAt(i - 2);
    if (h >= 0xd800 && h <= 0xdbff) return s.codePointAt(i - 2)!;
  }
  return c;
}

export class Regex {
  private readonly marks: Int32Array;
  private gen = 0;
  private readonly slots: number;
  /** Cheap pre-filter for the first character of a match (undefined: any). */
  private readonly first: ((c: number) => boolean) | undefined;

  constructor(
    private readonly prog: Inst[],
    readonly groups: number,
    private readonly budget: RegexBudget,
  ) {
    this.marks = new Int32Array(prog.length);
    this.slots = 2 * (groups + 1);
    this.first = this.firstFilter();
  }

  /** Does `s` contain a match? */
  test(s: string): boolean {
    return this.run(s, 0, true) !== null;
  }

  /** Leftmost-longest match at or after `from`. */
  exec(s: string, from = 0): RegexMatch | null {
    return this.run(s, from, false);
  }

  private firstFilter(): ((c: number) => boolean) | undefined {
    const seen = new Set<number>();
    const stack = [0];
    const tests: Inst[] = [];
    while (stack.length) {
      const pc = stack.pop()!;
      if (seen.has(pc)) continue;
      seen.add(pc);
      const inst = this.prog[pc]!;
      switch (inst.op) {
        case Op.Match:
          return undefined; // can match the empty string anywhere
        case Op.Jmp:
          stack.push(inst.a);
          break;
        case Op.Split:
          stack.push(inst.a, inst.b);
          break;
        case Op.Save:
        case Op.Assert:
          stack.push(pc + 1);
          break;
        case Op.Any:
          return undefined;
        default:
          tests.push(inst);
      }
    }
    return (c) => tests.some((t) => (t.op === Op.Char ? c === t.a || c === t.b : t.test!(c)));
  }

  private spend(n: number): void {
    this.budget.used += n;
    if (this.budget.used > this.budget.limit) throw new RegexLimitError();
  }

  private check(k: AssertKind, s: string, i: number): boolean {
    switch (k) {
      case "bol":
        return i === 0;
      case "eol":
        return i === s.length;
    }
    const before = isWordChar(prevCp(s, i));
    const after = i < s.length && isWordChar(s.codePointAt(i)!);
    switch (k) {
      case "wb":
        return before !== after;
      case "nwb":
        return before === after;
      case "wstart":
        return !before && after;
      case "wend":
        return before && !after;
      case "nwbefore":
        return !before;
      case "nwafter":
        return !after;
    }
  }

  /** Add the thread at `pc` and its epsilon closure, in priority order. */
  private add(list: Thread[], pc0: number, caps0: number[], s: string, i: number): void {
    const stack: Thread[] = [{ pc: pc0, caps: caps0 }];
    let steps = 0;
    while (stack.length) {
      const { pc, caps } = stack.pop()!;
      steps++;
      if (this.marks[pc] === this.gen) continue;
      this.marks[pc] = this.gen;
      const inst = this.prog[pc]!;
      switch (inst.op) {
        case Op.Jmp:
          stack.push({ pc: inst.a, caps });
          break;
        case Op.Split:
          stack.push({ pc: inst.b, caps }, { pc: inst.a, caps });
          break;
        case Op.Save: {
          const c = caps.slice();
          c[inst.a] = i;
          stack.push({ pc: pc + 1, caps: c });
          break;
        }
        case Op.Assert:
          if (this.check(inst.k!, s, i)) stack.push({ pc: pc + 1, caps });
          break;
        default:
          list.push({ pc, caps });
      }
    }
    this.spend(steps);
  }

  private run(s: string, from: number, firstOnly: boolean): RegexMatch | null {
    const len = s.length;
    let i = from;
    let clist: Thread[] = [];
    let matched: RegexMatch | null = null;
    this.gen++;
    for (;;) {
      if (!matched) {
        if (clist.length === 0 && this.first) {
          // Skip ahead to a character that can start a match.
          let skipped = 0;
          while (i < len && !this.first(s.codePointAt(i)!)) {
            i += s.codePointAt(i)! > 0xffff ? 2 : 1;
            skipped++;
          }
          this.spend(skipped);
          if (i >= len) {
            // Only an empty-width match could remain, and `first` says none can.
            return null;
          }
          this.gen++;
        }
        const caps = new Array<number>(this.slots).fill(-1);
        caps[0] = i;
        this.add(clist, 0, caps, s, i);
      }
      if (clist.length === 0) {
        if (matched || i >= len) break;
        i += s.codePointAt(i)! > 0xffff ? 2 : 1;
        this.gen++;
        continue;
      }
      const cp = i < len ? s.codePointAt(i)! : -1;
      const w = cp > 0xffff ? 2 : 1;
      this.gen++;
      const nlist: Thread[] = [];
      this.spend(clist.length);
      for (const t of clist) {
        if (matched && t.caps[0]! > matched.start) continue;
        const inst = this.prog[t.pc]!;
        switch (inst.op) {
          case Op.Match: {
            const start = t.caps[0]!;
            if (!matched || start < matched.start || (start === matched.start && i > matched.end)) {
              const caps = t.caps.slice();
              caps[1] = i;
              matched = { start, end: i, caps };
              if (firstOnly) return matched;
            }
            break;
          }
          case Op.Char:
            if (cp === inst.a || cp === inst.b) this.add(nlist, t.pc + 1, t.caps, s, i + w);
            break;
          case Op.Any:
            if (cp >= 0) this.add(nlist, t.pc + 1, t.caps, s, i + w);
            break;
          case Op.Set:
            if (cp >= 0 && inst.test!(cp)) this.add(nlist, t.pc + 1, t.caps, s, i + w);
            break;
        }
      }
      if (i >= len) break;
      clist = nlist;
      i += w;
    }
    return matched;
  }
}

export interface CompileOptions {
  icase?: boolean;
  budget: RegexBudget;
}

/** Compile a parsed pattern (optionally wrapped by the caller) to a Regex. */
export function buildRegex(parsed: ParsedRegex, opts: CompileOptions): Regex {
  const c = new Compiler(opts.icase ?? false);
  // Slots 0 and 1 (the whole match) are set by the VM itself.
  c.compile(parsed.node);
  c.prog.push({ op: Op.Match, a: 0, b: 0 });
  return new Regex(c.prog, parsed.groups, opts.budget);
}

/** Parse and compile in one go. */
export function compileRegex(pattern: string, opts: ParseOptions & CompileOptions): Regex {
  return buildRegex(parseRegex(pattern, opts), opts);
}

/** Wrap for grep -w (no word character on either side) or -x (whole line). */
export function wrapNode(node: RegexNode, mode: "word" | "line"): RegexNode {
  const [before, after]: [AssertKind, AssertKind] =
    mode === "word" ? ["nwbefore", "nwafter"] : ["bol", "eol"];
  return {
    t: "cat",
    items: [{ t: "assert", k: before }, node, { t: "assert", k: after }],
  };
}
