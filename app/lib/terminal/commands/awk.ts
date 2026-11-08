// awk (T-704, LLD §13.2, LB-2): a small, safe interpreter for Lab A's
// `awk '{print $(NF-3)}'` and the everyday one-liners around it.
//
// Supported: `-F fs` (`-Ft` is tab, as POSIX says), `-v var=value`,
// `var=value` operands; BEGIN/END; patterns (expressions and /regex/);
// `print` and `printf` (comma = OFS, juxtaposition = concatenation); `if`/
// `else`, `next`, `exit`; fields `$0`…`$NF`, `$(NF-k)`, field and NF
// assignment; NR NF FNR FS OFS ORS FILENAME OFMT CONVFMT; scalar variables
// with = += -= *= /= %= ^= ++ --; arithmetic, comparisons (strnum rules),
// `~ !~`, `&& || !`, `?:`; length substr index tolower toupper int sprintf.
//
// Left out on purpose (LB-3 "not available in this lab"): loops, arrays,
// user functions, getline, system(), output redirection and pipes, RS. There
// are no loops, so a program runs in time linear in its input; regexes use the
// lab's NFA engine (./regex.ts) and strings are capped in size.
// Messages follow gawk's wording.

import { fail, notAvailable, type CommandContext, type CommandSpec } from "../command";
import {
  buildRegex,
  newBudget,
  parseRegex,
  type Regex,
  type RegexBudget,
  RegexLimitError,
  RegexSyntaxError,
  RegexUnsupportedError,
} from "./regex";
import { parseOpts, readInput, splitLines, textOf } from "./textUtil";

const MAX_STRING = 8 * 1024 * 1024;
const MAX_FIELD = 100_000;
const MAX_WIDTH = 65_536;

// ------------------------------------------------------------------ errors

class AwkSyntaxError extends Error {
  constructor(
    message: string,
    readonly pos: number,
  ) {
    super(message);
  }
}

class Unsupported extends Error {}

class Fatal extends Error {}

class NextSignal extends Error {}

class ExitSignal {
  constructor(readonly code: number) {}
}

// ------------------------------------------------------------------ lexer

type TokType = "num" | "str" | "ere" | "name" | "func" | "kw" | "op" | "nl" | "eof";

interface Tok {
  t: TokType;
  v: string;
  num?: number;
  pos: number;
}

const KEYWORDS = new Set([
  "BEGIN",
  "END",
  "print",
  "printf",
  "if",
  "else",
  "next",
  "exit",
  "while",
  "for",
  "do",
  "break",
  "continue",
  "function",
  "func",
  "return",
  "delete",
  "getline",
  "in",
  "nextfile",
  "BEGINFILE",
  "ENDFILE",
  "switch",
  "case",
  "default",
]);

const SUPPORTED_FUNCS = new Set([
  "length",
  "substr",
  "index",
  "tolower",
  "toupper",
  "int",
  "sprintf",
]);
const OTHER_FUNCS = new Set([
  "sub",
  "gsub",
  "gensub",
  "match",
  "split",
  "patsplit",
  "system",
  "close",
  "fflush",
  "srand",
  "rand",
  "sin",
  "cos",
  "atan2",
  "exp",
  "log",
  "sqrt",
  "strftime",
  "systime",
  "mktime",
  "asort",
  "asorti",
  "and",
  "or",
  "xor",
  "lshift",
  "rshift",
  "compl",
  "strtonum",
  "isarray",
  "typeof",
]);

const OPS = [
  "**=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "^=",
  "**",
  "==",
  "<=",
  ">=",
  "!=",
  "++",
  "--",
  "&&",
  "||",
  ">>",
  "!~",
  "|&",
];
const SINGLE = "{}()[];,+-*/%^!><|?:~$=";

/** Tokens after which a newline is not a terminator. */
const NL_SKIP_AFTER = new Set(["{", "&&", "||", ",", ";", "do", "else"]);

/** Process awk string escapes (also used for -v and -F). */
export function awkUnescape(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c !== "\\" || i + 1 >= s.length) {
      out += c;
      continue;
    }
    const n = s[++i]!;
    const simple: Record<string, string> = {
      n: "\n",
      t: "\t",
      r: "\r",
      "\\": "\\",
      '"': '"',
      "/": "/",
      a: "\x07",
      b: "\b",
      f: "\f",
      v: "\v",
    };
    if (simple[n] !== undefined) out += simple[n];
    else if (/[0-7]/.test(n)) {
      let v = Number(n);
      for (let k = 0; k < 2 && /[0-7]/.test(s[i + 1] ?? ""); k++) v = v * 8 + Number(s[++i]);
      out += String.fromCharCode(v);
    } else out += n;
  }
  return out;
}

function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const prevSignificant = () => toks[toks.length - 1];
  const regexAllowed = () => {
    const p = prevSignificant();
    if (!p) return true;
    if (p.t === "num" || p.t === "str" || p.t === "name" || p.t === "ere") return false;
    if (p.t === "func" && p.v !== "getline") return false;
    if (
      p.t === "op" &&
      (p.v === ")" || p.v === "]" || p.v === "$" || p.v === "++" || p.v === "--")
    ) {
      return false;
    }
    return true;
  };
  while (i < src.length) {
    const c = src[i]!;
    if (c === " " || c === "\t" || c === "\r") {
      i++;
      continue;
    }
    if (c === "\\" && src[i + 1] === "\n") {
      i += 2;
      continue;
    }
    if (c === "#") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === "\n") {
      const p = prevSignificant();
      if (p && p.t !== "nl" && !NL_SKIP_AFTER.has(p.v)) toks.push({ t: "nl", v: "\n", pos: i });
      i++;
      continue;
    }
    const start = i;
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      const m = /^(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?)/.exec(src.slice(i))!;
      i += m[0].length;
      toks.push({ t: "num", v: m[0], num: Number(m[0]), pos: start });
      continue;
    }
    if (c === '"') {
      i++;
      let raw = "";
      while (i < src.length && src[i] !== '"') {
        if (src[i] === "\n") throw new AwkSyntaxError("unterminated string", start);
        if (src[i] === "\\" && i + 1 < src.length) {
          if (src[i + 1] === "\n") {
            i += 2;
            continue;
          }
          raw += src[i]! + src[i + 1]!;
          i += 2;
          continue;
        }
        raw += src[i++];
      }
      if (i >= src.length) throw new AwkSyntaxError("unterminated string", start);
      i++;
      toks.push({ t: "str", v: awkUnescape(raw), pos: start });
      continue;
    }
    if (c === "/" && regexAllowed()) {
      i++;
      let raw = "";
      let inBracket = false;
      while (i < src.length) {
        const d = src[i]!;
        if (d === "\n") break;
        if (d === "\\" && i + 1 < src.length) {
          raw += d + src[i + 1];
          i += 2;
          continue;
        }
        if (inBracket) {
          if (d === "]") inBracket = false;
        } else if (d === "[") {
          inBracket = true;
          raw += d;
          i++;
          if (src[i] === "^") raw += src[i++];
          if (src[i] === "]") raw += src[i++];
          continue;
        } else if (d === "/") break;
        raw += d;
        i++;
      }
      if (src[i] !== "/") throw new AwkSyntaxError("unterminated regexp", start);
      i++;
      toks.push({ t: "ere", v: raw, pos: start });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      i += m[0].length;
      const w = m[0];
      const t: TokType = KEYWORDS.has(w)
        ? "kw"
        : SUPPORTED_FUNCS.has(w) || OTHER_FUNCS.has(w)
          ? "func"
          : "name";
      toks.push({ t, v: w, pos: start });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) {
      i += op.length;
      toks.push({ t: "op", v: op, pos: start });
      continue;
    }
    if (SINGLE.includes(c)) {
      i++;
      toks.push({ t: "op", v: c, pos: start });
      continue;
    }
    throw new AwkSyntaxError("syntax error", start);
  }
  toks.push({ t: "eof", v: "", pos: src.length });
  return toks;
}

// ------------------------------------------------------------------ AST

type LValue = { t: "var"; name: string } | { t: "field"; e: Expr };

type Expr =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "re"; re: Regex }
  | LValue
  | { t: "assign"; op: string; target: LValue; e: Expr }
  | { t: "cond"; c: Expr; a: Expr; b: Expr }
  | { t: "or" | "and"; a: Expr; b: Expr }
  | { t: "match"; neg: boolean; a: Expr; re: Expr }
  | { t: "cmp"; op: string; a: Expr; b: Expr }
  | { t: "cat"; a: Expr; b: Expr }
  | { t: "bin"; op: string; a: Expr; b: Expr }
  | { t: "unary"; op: "-" | "+" | "!"; e: Expr }
  | { t: "incdec"; pre: boolean; delta: number; target: LValue }
  | { t: "call"; name: string; args: Expr[]; pos: number };

type Stmt =
  | { t: "print"; args: Expr[] }
  | { t: "printf"; args: Expr[]; pos: number }
  | { t: "expr"; e: Expr }
  | { t: "if"; c: Expr; then: Stmt; else?: Stmt }
  | { t: "block"; body: Stmt[] }
  | { t: "next" }
  | { t: "exit"; e?: Expr };

interface Item {
  kind: "begin" | "end" | "main";
  pattern?: Expr;
  action?: Stmt[];
}

// ------------------------------------------------------------------ parser

class AwkParser {
  private k = 0;

  constructor(
    private readonly toks: Tok[],
    private readonly compileRe: (src: string) => Regex,
  ) {}

  private get tok(): Tok {
    return this.toks[this.k]!;
  }

  private is(v: string, t?: TokType): boolean {
    const tok = this.tok;
    return tok.v === v && (t ? tok.t === t : tok.t === "op" || tok.t === "kw");
  }

  private eat(v: string): boolean {
    if (this.is(v)) {
      this.k++;
      return true;
    }
    return false;
  }

  private expect(v: string): void {
    if (!this.eat(v)) this.syntax();
  }

  private syntax(): never {
    throw new AwkSyntaxError("syntax error", this.tok.pos);
  }

  private skipTerminators(): void {
    while (this.tok.t === "nl" || this.is(";")) this.k++;
  }

  private skipNl(): void {
    while (this.tok.t === "nl") this.k++;
  }

  program(): Item[] {
    const items: Item[] = [];
    this.skipTerminators();
    while (this.tok.t !== "eof") {
      items.push(this.item());
      this.skipTerminators();
    }
    return items;
  }

  private item(): Item {
    if (this.tok.t === "kw" && (this.tok.v === "BEGIN" || this.tok.v === "END")) {
      const kind = this.tok.v === "BEGIN" ? "begin" : "end";
      this.k++;
      this.skipNl();
      if (!this.is("{")) this.syntax();
      return { kind, action: this.block() };
    }
    if (this.tok.t === "kw" && (this.tok.v === "function" || this.tok.v === "func")) {
      throw new Unsupported("a user-defined function");
    }
    if (this.tok.t === "kw" && (this.tok.v === "BEGINFILE" || this.tok.v === "ENDFILE")) {
      throw new Unsupported(this.tok.v);
    }
    if (this.is("{")) return { kind: "main", action: this.block() };
    const pattern = this.expr(false);
    if (this.is(",")) throw new Unsupported("a range pattern (pat1, pat2)");
    if (this.is("{")) return { kind: "main", pattern, action: this.block() };
    if (this.tok.t !== "nl" && !this.is(";") && this.tok.t !== "eof") this.syntax();
    return { kind: "main", pattern };
  }

  private block(): Stmt[] {
    this.expect("{");
    const body: Stmt[] = [];
    for (;;) {
      this.skipTerminators();
      if (this.eat("}")) return body;
      if (this.tok.t === "eof") this.syntax();
      body.push(this.stmt());
    }
  }

  /** After a simple statement: `;`, newline, `}` or end. */
  private endSimple(): void {
    if (this.tok.t === "nl" || this.is(";")) {
      this.k++;
      return;
    }
    if (this.is("}") || this.tok.t === "eof") return;
    this.syntax();
  }

  private stmt(): Stmt {
    const tok = this.tok;
    if (this.is("{")) return { t: "block", body: this.block() };
    if (tok.t === "kw") {
      switch (tok.v) {
        case "if": {
          this.k++;
          this.expect("(");
          const c = this.expr(false);
          this.expect(")");
          this.skipNl();
          const then = this.stmt();
          const save = this.k;
          this.skipTerminators();
          if (this.tok.t === "kw" && this.tok.v === "else") {
            this.k++;
            this.skipNl();
            return { t: "if", c, then, else: this.stmt() };
          }
          this.k = save;
          return { t: "if", c, then };
        }
        case "print":
        case "printf": {
          this.k++;
          const args = this.printArgs();
          if (this.is(">") || this.is(">>")) throw new Unsupported("output redirection (> file)");
          if (this.is("|") || this.is("|&")) throw new Unsupported("a pipe to a command (| cmd)");
          this.endSimple();
          if (tok.v === "print") return { t: "print", args };
          if (args.length === 0) this.syntax();
          return { t: "printf", args, pos: tok.pos };
        }
        case "next":
          this.k++;
          this.endSimple();
          return { t: "next" };
        case "exit": {
          this.k++;
          let e: Expr | undefined;
          if (this.tok.t !== "nl" && !this.is(";") && !this.is("}") && this.tok.t !== "eof") {
            e = this.expr(false);
          }
          this.endSimple();
          return { t: "exit", e };
        }
        case "while":
        case "for":
        case "do":
          throw new Unsupported(`the '${tok.v}' loop`);
        case "delete":
          throw new Unsupported("an array (a[k])");
        case "getline":
          throw new Unsupported("getline");
        case "nextfile":
          throw new Unsupported("nextfile");
        case "break":
        case "continue":
        case "return":
        case "switch":
          throw new Unsupported(`'${tok.v}'`);
        default:
          this.syntax();
      }
    }
    if (this.eat(";")) return { t: "block", body: [] };
    const e = this.expr(false);
    this.endSimple();
    return { t: "expr", e };
  }

  private atPrintEnd(): boolean {
    return (
      this.tok.t === "nl" ||
      this.tok.t === "eof" ||
      this.is(";") ||
      this.is("}") ||
      this.is(">") ||
      this.is(">>") ||
      this.is("|") ||
      this.is("|&")
    );
  }

  private printArgs(): Expr[] {
    if (this.atPrintEnd()) return [];
    if (this.is("(")) {
      // `print (a, b)`: a parenthesised list, if that is all there is.
      const save = this.k;
      this.k++;
      try {
        const list = this.exprList(false);
        if (this.eat(")") && this.atPrintEnd()) return list;
      } catch (e) {
        if (!(e instanceof AwkSyntaxError)) throw e;
      }
      this.k = save;
    }
    return this.exprList(true);
  }

  private exprList(noGt: boolean): Expr[] {
    const list = [this.expr(noGt)];
    while (this.eat(",")) {
      this.skipNl();
      list.push(this.expr(noGt));
    }
    return list;
  }

  private expr(noGt: boolean): Expr {
    return this.assignment(noGt);
  }

  private assignment(noGt: boolean): Expr {
    const left = this.ternary(noGt);
    const tok = this.tok;
    if (tok.t === "op" && ["=", "+=", "-=", "*=", "/=", "%=", "^=", "**="].includes(tok.v)) {
      if (left.t !== "var" && left.t !== "field") this.syntax();
      this.k++;
      this.skipNl();
      if (left.t === "var" && left.name === "RS") throw new Unsupported("changing RS");
      const e = this.assignment(noGt);
      return { t: "assign", op: tok.v === "**=" ? "^=" : tok.v, target: left, e };
    }
    return left;
  }

  private ternary(noGt: boolean): Expr {
    const c = this.or(noGt);
    if (!this.eat("?")) return c;
    this.skipNl();
    const a = this.ternary(noGt);
    this.skipNl();
    this.expect(":");
    this.skipNl();
    const b = this.ternary(noGt);
    return { t: "cond", c, a, b };
  }

  private or(noGt: boolean): Expr {
    let a = this.and(noGt);
    while (this.eat("||")) {
      this.skipNl();
      a = { t: "or", a, b: this.and(noGt) };
    }
    return a;
  }

  private and(noGt: boolean): Expr {
    let a = this.inExpr(noGt);
    while (this.eat("&&")) {
      this.skipNl();
      a = { t: "and", a, b: this.inExpr(noGt) };
    }
    return a;
  }

  private inExpr(noGt: boolean): Expr {
    const a = this.matchExpr(noGt);
    if (this.is("in", "kw")) throw new Unsupported("an array (a[k])");
    return a;
  }

  private matchExpr(noGt: boolean): Expr {
    let a = this.relational(noGt);
    while (this.is("~") || this.is("!~")) {
      const neg = this.tok.v === "!~";
      this.k++;
      a = { t: "match", neg, a, re: this.relational(noGt) };
    }
    return a;
  }

  private relational(noGt: boolean): Expr {
    const a = this.concat();
    const tok = this.tok;
    if (tok.t === "op" && ["<", "<=", "==", "!=", ">=", ">"].includes(tok.v)) {
      if (tok.v === ">" && noGt) return a;
      this.k++;
      return { t: "cmp", op: tok.v, a, b: this.concat() };
    }
    return a;
  }

  private startsConcat(): boolean {
    const tok = this.tok;
    if (tok.t === "num" || tok.t === "str" || tok.t === "ere" || tok.t === "name") return true;
    if (tok.t === "func") return true;
    if (tok.t === "kw" && tok.v === "getline") return true;
    // Not `-`, `+` or `!`: `a -1` is a subtraction.
    return tok.t === "op" && ["$", "(", "++", "--"].includes(tok.v);
  }

  private concat(): Expr {
    let a = this.additive();
    while (this.startsConcat()) {
      a = { t: "cat", a, b: this.additive() };
    }
    return a;
  }

  private additive(): Expr {
    let a = this.multiplicative();
    while (this.is("+") || this.is("-")) {
      const op = this.tok.v;
      this.k++;
      a = { t: "bin", op, a, b: this.multiplicative() };
    }
    return a;
  }

  private multiplicative(): Expr {
    let a = this.unary();
    while (this.is("*") || this.is("/") || this.is("%")) {
      const op = this.tok.v;
      this.k++;
      a = { t: "bin", op, a, b: this.unary() };
    }
    return a;
  }

  private unary(): Expr {
    if (this.is("!") || this.is("-") || this.is("+")) {
      const op = this.tok.v as "!" | "-" | "+";
      this.k++;
      return { t: "unary", op, e: this.unary() };
    }
    return this.power();
  }

  private power(): Expr {
    const a = this.postfix();
    if (this.is("^") || this.is("**")) {
      this.k++;
      // Right associative, and binds tighter than unary minus on its left.
      const b = this.is("-") || this.is("+") || this.is("!") ? this.unary() : this.power();
      return { t: "bin", op: "^", a, b };
    }
    return a;
  }

  private postfix(): Expr {
    if (this.is("++") || this.is("--")) {
      const delta = this.tok.v === "++" ? 1 : -1;
      this.k++;
      const target = this.postfix();
      if (target.t !== "var" && target.t !== "field") this.syntax();
      return { t: "incdec", pre: true, delta, target };
    }
    const e = this.primary();
    if ((e.t === "var" || e.t === "field") && (this.is("++") || this.is("--"))) {
      const delta = this.tok.v === "++" ? 1 : -1;
      this.k++;
      return { t: "incdec", pre: false, delta, target: e };
    }
    return e;
  }

  private primary(): Expr {
    const tok = this.tok;
    switch (tok.t) {
      case "num":
        this.k++;
        return { t: "num", v: tok.num! };
      case "str":
        this.k++;
        return { t: "str", v: tok.v };
      case "ere":
        this.k++;
        return { t: "re", re: this.compileRe(tok.v) };
      case "name":
        this.k++;
        if (this.is("[")) throw new Unsupported("an array (a[k])");
        if (this.is("(") && this.toks[this.k]!.pos === tok.pos + tok.v.length) {
          throw new Unsupported("a user-defined function");
        }
        return { t: "var", name: tok.v };
      case "func": {
        this.k++;
        if (!SUPPORTED_FUNCS.has(tok.v)) throw new Unsupported(`the ${tok.v}() function`);
        const args: Expr[] = [];
        if (this.eat("(")) {
          if (!this.eat(")")) {
            args.push(...this.exprList(false));
            this.expect(")");
          }
        } else if (tok.v !== "length") {
          this.syntax();
        }
        return { t: "call", name: tok.v, args, pos: tok.pos };
      }
      case "kw":
        if (tok.v === "getline") throw new Unsupported("getline");
        this.syntax();
        break;
      case "op":
        if (tok.v === "$") {
          this.k++;
          let e: Expr;
          if (this.is("-") || this.is("+") || this.is("!")) {
            const op = this.tok.v as "-" | "+" | "!";
            this.k++;
            e = { t: "unary", op, e: this.primary() };
          } else if (this.is("++") || this.is("--")) {
            e = this.postfix();
          } else {
            e = this.primary();
          }
          return { t: "field", e };
        }
        if (tok.v === "(") {
          this.k++;
          const e = this.expr(false);
          if (this.is(",")) throw new Unsupported("an array (a[k])");
          this.expect(")");
          return e;
        }
        break;
    }
    this.syntax();
  }
}

// ------------------------------------------------------------------ values

/** 0 number, 1 string, 2 strnum (input that looks numeric), 3 uninitialised. */
type Val = { k: 0; n: number } | { k: 1; s: string } | { k: 2; s: string; n: number } | { k: 3 };

const UNINIT: Val = { k: 3 };
const num = (n: number): Val => ({ k: 0, n });
const str = (s: string): Val => ({ k: 1, s });

const LOOKS_NUMERIC =
  /^[ \t\n\r\f\v]*[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?)[ \t\n\r\f\v]*$/;
const NUMERIC_PREFIX = /^[ \t\n\r\f\v]*[-+]?(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?)/;

function strnum(s: string): Val {
  if (LOOKS_NUMERIC.test(s)) return { k: 2, s, n: Number(s.trim()) };
  return str(s);
}

function toNumber(v: Val): number {
  switch (v.k) {
    case 0:
      return v.n;
    case 2:
      return v.n;
    case 3:
      return 0;
    case 1: {
      const m = NUMERIC_PREFIX.exec(v.s);
      return m ? Number(m[0].trim()) : 0;
    }
  }
}

function toBool(v: Val): boolean {
  switch (v.k) {
    case 0:
    case 2:
      return v.n !== 0;
    case 1:
      return v.s !== "";
    case 3:
      return false;
  }
}

// ------------------------------------------------------------------ printf

function padTo(s: string, width: number, left: boolean, zero: boolean): string {
  if (s.length >= width) return s;
  if (left) return s.padEnd(width);
  if (zero) {
    const sign = /^[-+ ]/.test(s) ? s[0]! : "";
    const prefix = /^[-+ ]?0[xX]/.test(s) ? s.slice(0, sign.length + 2) : sign;
    return prefix + s.slice(prefix.length).padStart(width - prefix.length, "0");
  }
  return s.padStart(width);
}

function expPad(s: string): string {
  // JS gives `1.5e+0`; C gives `1.5e+00`.
  return s.replace(/e([-+])(\d)$/, "e$10$2");
}

function formatFloat(n: number, conv: string, prec: number, alt: boolean): string {
  if (!Number.isFinite(n)) {
    const s = Number.isNaN(n) ? "nan" : "inf";
    return conv === conv.toUpperCase() ? s.toUpperCase() : s;
  }
  const lower = conv.toLowerCase();
  let s: string;
  if (lower === "f") {
    s =
      Math.abs(n) < 1e21
        ? Math.abs(n).toFixed(Math.min(prec, 100))
        : BigInt(Math.trunc(Math.abs(n))).toString();
    if (alt && prec === 0) s += ".";
  } else if (lower === "e") {
    s = expPad(Math.abs(n).toExponential(Math.min(prec, 100)));
    if (alt && prec === 0) s = s.replace("e", ".e");
  } else {
    const p = prec === 0 ? 1 : prec;
    const a = Math.abs(n);
    if (a === 0) {
      s = alt ? (0).toFixed(p - 1) : "0";
    } else {
      const x = Number(a.toExponential(Math.min(p - 1, 100)).split("e")[1]);
      if (x < -4 || x >= p) {
        s = expPad(a.toExponential(Math.min(p - 1, 100)));
        if (!alt) s = s.replace(/\.?0+e/, "e");
      } else {
        s = a.toFixed(Math.min(p - 1 - x, 100));
        if (!alt && s.includes(".")) s = s.replace(/\.?0+$/, "");
      }
    }
  }
  if (conv === conv.toUpperCase()) s = s.toUpperCase();
  return (n < 0 || Object.is(n, -0) ? "-" : "") + s;
}

function formatNumber(n: number, fmt: string): string {
  // gawk prints integral values that fit in a C long as integers.
  if (Number.isInteger(n) && Math.abs(n) < 2 ** 63) {
    return Object.is(n, -0) ? "-0" : BigInt(n).toString();
  }
  if (!Number.isFinite(n))
    return Number.isNaN(n) ? (n < 0 ? "-nan" : "+nan") : n < 0 ? "-inf" : "+inf";
  if (fmt === "%.6g") return formatFloat(n, "g", 6, false);
  return sprintf(fmt, [num(n)], (v) => (v.k === 1 || v.k === 2 ? v.s : String(toNumber(v))));
}

function sprintf(fmt: string, args: Val[], toStr: (v: Val) => string): string {
  let out = "";
  let argi = 0;
  const next = (): Val => {
    if (argi >= args.length) throw new Fatal("not enough arguments to satisfy format string");
    return args[argi++]!;
  };
  for (let i = 0; i < fmt.length; i++) {
    if (out.length > MAX_STRING) throw new Fatal("string too long for the lab");
    const c = fmt[i]!;
    if (c !== "%") {
      out += c;
      continue;
    }
    const m = /^%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d*))?([diouxXcseEfFgG%])/.exec(fmt.slice(i));
    if (!m) {
      out += c;
      continue;
    }
    i += m[0].length - 1;
    const flags = m[1]!;
    const conv = m[4]!;
    if (conv === "%") {
      out += "%";
      continue;
    }
    let width = m[2] === "*" ? Math.trunc(toNumber(next())) : m[2] ? Number(m[2]) : 0;
    let left = flags.includes("-");
    if (width < 0) {
      left = true;
      width = -width;
    }
    let prec: number | undefined =
      m[3] === undefined
        ? undefined
        : m[3] === "*"
          ? Math.trunc(toNumber(next()))
          : Number(m[3] || "0");
    if (prec !== undefined && prec < 0) prec = undefined;
    if (width > MAX_WIDTH || (prec ?? 0) > MAX_WIDTH)
      throw new Fatal("format width too large for the lab");
    const arg = next();
    const zero = flags.includes("0") && !left;
    const sign = (neg: boolean) =>
      neg ? "-" : flags.includes("+") ? "+" : flags.includes(" ") ? " " : "";
    let s: string;
    switch (conv) {
      case "d":
      case "i": {
        const n = Math.trunc(toNumber(arg));
        if (!Number.isFinite(n)) {
          out += padTo(formatFloat(n, "f", 0, false), width, left, false);
          continue;
        }
        let digits = BigInt(Math.abs(n)).toString();
        if (prec !== undefined) digits = prec === 0 && n === 0 ? "" : digits.padStart(prec, "0");
        s = sign(n < 0) + digits;
        out += padTo(s, width, left, zero && prec === undefined);
        continue;
      }
      case "o":
      case "u":
      case "x":
      case "X": {
        const n = Math.trunc(toNumber(arg));
        const big = n < 0 ? BigInt.asUintN(64, BigInt(n)) : BigInt(Number.isFinite(n) ? n : 0);
        const base = conv === "o" ? 8 : conv === "u" ? 10 : 16;
        let digits = big.toString(base);
        if (conv === "X") digits = digits.toUpperCase();
        if (prec !== undefined) digits = prec === 0 && big === 0n ? "" : digits.padStart(prec, "0");
        if (flags.includes("#") && big !== 0n) {
          if (conv === "x") digits = "0x" + digits;
          else if (conv === "X") digits = "0X" + digits;
          else if (conv === "o" && !digits.startsWith("0")) digits = "0" + digits;
        }
        out += padTo(digits, width, left, zero && prec === undefined);
        continue;
      }
      case "c": {
        if (arg.k === 0)
          s = String.fromCodePoint(Math.max(0, Math.min(0x10ffff, Math.trunc(arg.n))));
        else s = Array.from(toStr(arg))[0] ?? "";
        out += padTo(s, width, left, false);
        continue;
      }
      case "s": {
        s = toStr(arg);
        if (prec !== undefined) s = Array.from(s).slice(0, prec).join("");
        out += padTo(s, width, left, false);
        continue;
      }
      default: {
        const n = toNumber(arg);
        s = formatFloat(n, conv, prec ?? 6, flags.includes("#"));
        if (!s.startsWith("-")) s = sign(false) + s;
        out += padTo(s, width, left, zero && Number.isFinite(n));
      }
    }
    if (out.length > MAX_STRING) throw new Fatal("string too long for the lab");
  }
  return out;
}

// ------------------------------------------------------------------ runtime

class Runtime {
  readonly vars = new Map<string, Val>();
  record = "";
  private fields: string[] | null = [];
  nr = 0;
  fnr = 0;
  filename = "";
  private readonly reCache = new Map<string, Regex>();
  private fsCache: { fs: string; re?: Regex } | undefined;

  constructor(
    private readonly write: (s: string) => void,
    private readonly budget: RegexBudget,
  ) {
    this.vars.set("FS", str(" "));
    this.vars.set("OFS", str(" "));
    this.vars.set("ORS", str("\n"));
    this.vars.set("RS", str("\n"));
    this.vars.set("OFMT", str("%.6g"));
    this.vars.set("CONVFMT", str("%.6g"));
    this.vars.set("SUBSEP", str("\x1c"));
    this.vars.set("RSTART", num(0));
    this.vars.set("RLENGTH", num(-1));
  }

  private sv(name: string): string {
    return this.toStr(this.vars.get(name) ?? UNINIT);
  }

  toStr(v: Val, fmtVar = "CONVFMT"): string {
    switch (v.k) {
      case 1:
      case 2:
        return v.s;
      case 3:
        return "";
      case 0:
        return formatNumber(v.n, this.sv(fmtVar));
    }
  }

  dynamicRegex(src: string): Regex {
    let re = this.reCache.get(src);
    if (!re) {
      re = buildRegex(parseRegex(src, { extended: true, awk: true }), { budget: this.budget });
      if (this.reCache.size > 64) this.reCache.clear();
      this.reCache.set(src, re);
    }
    return re;
  }

  setRecord(line: string): void {
    this.record = line;
    this.fields = null;
  }

  private split(): string[] {
    if (this.fields) return this.fields;
    const fs = this.sv("FS");
    const rec = this.record;
    let out: string[];
    if (rec === "") out = [];
    else if (fs === " ") {
      const t = rec.replace(/^[ \t\n]+|[ \t\n]+$/g, "");
      out = t === "" ? [] : t.split(/[ \t\n]+/);
    } else if (fs === "") {
      out = Array.from(rec);
    } else if (Array.from(fs).length === 1 && fs !== "\\") {
      out = rec.split(fs);
    } else {
      if (this.fsCache?.fs !== fs) this.fsCache = { fs, re: this.dynamicRegex(fs) };
      const re = this.fsCache.re!;
      out = [];
      let from = 0;
      let pos = 0;
      while (pos <= rec.length) {
        const m = re.exec(rec, pos);
        if (!m) break;
        if (m.end === m.start) {
          pos = m.end + 1;
          continue;
        }
        out.push(rec.slice(from, m.start));
        from = m.end;
        pos = m.end;
      }
      out.push(rec.slice(from));
    }
    this.fields = out;
    return out;
  }

  get nf(): number {
    return this.split().length;
  }

  private fieldIndex(v: Val): number {
    const n = Math.trunc(toNumber(v));
    if (n < 0 || Number.isNaN(n)) throw new Fatal(`attempt to access field ${n}`);
    if (n > MAX_FIELD) throw new Fatal(`field index ${n} is too large for the lab`);
    return n;
  }

  getField(v: Val): Val {
    const n = this.fieldIndex(v);
    if (n === 0) return strnum(this.record);
    const f = this.split();
    return n <= f.length ? strnum(f[n - 1]!) : UNINIT;
  }

  private rebuild(): void {
    const s = this.fields!.join(this.sv("OFS"));
    if (s.length > MAX_STRING) throw new Fatal("record too long for the lab");
    this.record = s;
  }

  setField(v: Val, value: Val): void {
    const n = this.fieldIndex(v);
    const s = this.toStr(value);
    if (n === 0) {
      this.setRecord(s);
      return;
    }
    const f = this.split();
    while (f.length < n) f.push("");
    f[n - 1] = s;
    this.rebuild();
  }

  setNF(n: number): void {
    if (n < 0) throw new Fatal(`NF set to negative value`);
    if (n > MAX_FIELD) throw new Fatal(`NF ${n} is too large for the lab`);
    const f = this.split();
    while (f.length < n) f.push("");
    f.length = n;
    this.rebuild();
  }

  getVar(name: string): Val {
    switch (name) {
      case "NF":
        return num(this.nf);
      case "NR":
        return num(this.nr);
      case "FNR":
        return num(this.fnr);
      case "FILENAME":
        return str(this.filename);
    }
    return this.vars.get(name) ?? UNINIT;
  }

  setVar(name: string, v: Val): void {
    switch (name) {
      case "NF":
        this.setNF(Math.trunc(toNumber(v)));
        return;
      case "NR":
        this.nr = Math.trunc(toNumber(v));
        return;
      case "FNR":
        this.fnr = Math.trunc(toNumber(v));
        return;
      case "FILENAME":
        this.filename = this.toStr(v);
        return;
      case "FS":
        this.vars.set(name, v);
        return;
    }
    this.vars.set(name, v);
  }

  private get(target: LValue): Val {
    return target.t === "var" ? this.getVar(target.name) : this.getField(this.eval(target.e));
  }

  private set(target: LValue, v: Val): void {
    if (target.t === "var") this.setVar(target.name, v);
    else this.setField(this.eval(target.e), v);
  }

  private arith(op: string, a: number, b: number): number {
    switch (op) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        if (b === 0) throw new Fatal("division by zero attempted");
        return a / b;
      case "%":
        if (b === 0) throw new Fatal("division by zero attempted in `%'");
        return a % b;
      default:
        return Math.pow(a, b);
    }
  }

  private regexOf(e: Expr): Regex {
    if (e.t === "re") return e.re;
    return this.dynamicRegex(this.toStr(this.eval(e)));
  }

  private compare(op: string, a: Val, b: Val): boolean {
    let c: number;
    if (a.k !== 1 && b.k !== 1) {
      const x = toNumber(a);
      const y = toNumber(b);
      c = x < y ? -1 : x > y ? 1 : x === y ? 0 : NaN;
    } else {
      const x = this.toStr(a);
      const y = this.toStr(b);
      c = x < y ? -1 : x > y ? 1 : 0;
    }
    switch (op) {
      case "<":
        return c < 0;
      case "<=":
        return c <= 0;
      case ">":
        return c > 0;
      case ">=":
        return c >= 0;
      case "==":
        return c === 0;
      default:
        return c !== 0;
    }
  }

  eval(e: Expr): Val {
    switch (e.t) {
      case "num":
        return num(e.v);
      case "str":
        return str(e.v);
      case "re":
        return num(e.re.test(this.record) ? 1 : 0);
      case "var":
      case "field":
        return this.get(e);
      case "assign": {
        let v = this.eval(e.e);
        if (e.op !== "=") {
          const cur = toNumber(this.get(e.target));
          v = num(this.arith(e.op[0]!, cur, toNumber(v)));
        }
        this.set(e.target, v);
        return v;
      }
      case "cond":
        return toBool(this.eval(e.c)) ? this.eval(e.a) : this.eval(e.b);
      case "or":
        return num(toBool(this.eval(e.a)) || toBool(this.eval(e.b)) ? 1 : 0);
      case "and":
        return num(toBool(this.eval(e.a)) && toBool(this.eval(e.b)) ? 1 : 0);
      case "match": {
        const s = this.toStr(this.eval(e.a));
        return num(this.regexOf(e.re).test(s) !== e.neg ? 1 : 0);
      }
      case "cmp":
        return num(this.compare(e.op, this.eval(e.a), this.eval(e.b)) ? 1 : 0);
      case "cat": {
        const s = this.toStr(this.eval(e.a)) + this.toStr(this.eval(e.b));
        if (s.length > MAX_STRING) throw new Fatal("string too long for the lab");
        return str(s);
      }
      case "bin":
        return num(this.arith(e.op, toNumber(this.eval(e.a)), toNumber(this.eval(e.b))));
      case "unary": {
        const v = this.eval(e.e);
        if (e.op === "!") return num(toBool(v) ? 0 : 1);
        return num(e.op === "-" ? -toNumber(v) : toNumber(v));
      }
      case "incdec": {
        const old = toNumber(this.get(e.target));
        this.set(e.target, num(old + e.delta));
        return num(e.pre ? old + e.delta : old);
      }
      case "call":
        return this.call(e.name, e.args);
    }
  }

  private call(name: string, args: Expr[]): Val {
    const vals = args.map((a) => this.eval(a));
    const s = (i: number) => this.toStr(vals[i] ?? UNINIT);
    const arity = (min: number, max: number) => {
      if (vals.length < min || vals.length > max) {
        throw new Fatal(`${name}: called with ${vals.length} arguments`);
      }
    };
    switch (name) {
      case "length":
        arity(0, 1);
        return num(Array.from(vals.length ? s(0) : this.record).length);
      case "substr": {
        arity(2, 3);
        const chars = Array.from(s(0));
        const m = toNumber(vals[1]!);
        let start = Math.round(m);
        let end = vals.length > 2 ? start + Math.round(toNumber(vals[2]!)) : Infinity;
        if (Number.isNaN(start)) start = 1;
        if (start < 1) start = 1;
        if (end > chars.length + 1) end = chars.length + 1;
        return str(end > start ? chars.slice(start - 1, end - 1).join("") : "");
      }
      case "index": {
        arity(2, 2);
        const at = s(0).indexOf(s(1));
        return num(at < 0 ? 0 : Array.from(s(0).slice(0, at)).length + 1);
      }
      case "tolower":
        arity(1, 1);
        return str(s(0).toLowerCase());
      case "toupper":
        arity(1, 1);
        return str(s(0).toUpperCase());
      case "int":
        arity(1, 1);
        return num(Math.trunc(toNumber(vals[0]!)));
      case "sprintf":
        if (vals.length === 0) throw new Fatal("sprintf: no arguments");
        return str(sprintf(s(0), vals.slice(1), (v) => this.toStr(v)));
    }
    throw new Unsupported(`the ${name}() function`);
  }

  exec(stmts: Stmt[]): void {
    for (const st of stmts) this.stmt(st);
  }

  private stmt(st: Stmt): void {
    switch (st.t) {
      case "print": {
        const parts = st.args.length
          ? st.args.map((a) => this.toStr(this.eval(a), "OFMT"))
          : [this.record];
        this.write(parts.join(this.sv("OFS")) + this.sv("ORS"));
        return;
      }
      case "printf": {
        const vals = st.args.map((a) => this.eval(a));
        this.write(sprintf(this.toStr(vals[0]!), vals.slice(1), (v) => this.toStr(v)));
        return;
      }
      case "expr":
        this.eval(st.e);
        return;
      case "if":
        if (toBool(this.eval(st.c))) this.stmt(st.then);
        else if (st.else) this.stmt(st.else);
        return;
      case "block":
        this.exec(st.body);
        return;
      case "next":
        throw new NextSignal();
      case "exit":
        throw new ExitSignal(st.e ? Math.trunc(toNumber(this.eval(st.e))) & 255 : -1);
    }
  }
}

// ------------------------------------------------------------------ command

function syntaxMessage(src: string, pos: number, message: string): string {
  const before = src.slice(0, pos);
  const lineNo = before.split("\n").length;
  const lineStart = before.lastIndexOf("\n") + 1;
  const lineEnd = src.indexOf("\n", pos);
  const line = src.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
  const col = pos - lineStart;
  return (
    `awk: cmd. line:${lineNo}: ${line}\n` +
    `awk: cmd. line:${lineNo}: ${" ".repeat(col)}^ ${message}\n`
  );
}

const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function awk(ctx: CommandContext): number {
  const opts = parseOpts(ctx, { values: "Fvf", stopAtOperand: true });
  if (!opts) return 2;
  if (opts.values.has("f")) return notAvailable(ctx, "option '-f' (program files)");
  const operands = [...opts.operands];
  const src = operands.shift();
  if (src === undefined) {
    ctx.stderr.write("Usage: awk [-F fs] [-v var=value] 'program' [file ...]\n");
    return 2;
  }

  const budget = newBudget();
  const out = (s: string) => ctx.stdout.write(s);
  const rt = new Runtime(out, budget);
  const fatal = (msg: string) => {
    const where = rt.nr > 0 ? `(FILENAME=${rt.filename || "-"} FNR=${rt.fnr}) ` : "";
    ctx.stderr.write(`awk: cmd. line:1: ${where}fatal: ${msg}\n`);
    return 2;
  };

  const fsArg = opts.values.get("F")?.at(-1);
  if (fsArg !== undefined) rt.setVar("FS", str(fsArg === "t" ? "\t" : awkUnescape(fsArg)));
  const assign = (spec: string): boolean => {
    const eq = spec.indexOf("=");
    const name = spec.slice(0, eq);
    if (eq < 1 || !VAR_NAME.test(name)) return false;
    if (name === "RS") throw new Unsupported("changing RS");
    rt.setVar(name, strnum(awkUnescape(spec.slice(eq + 1))));
    return true;
  };

  let items: Item[];
  try {
    for (const v of opts.values.get("v") ?? []) {
      if (!assign(v)) {
        ctx.stderr.write(`awk: \`${v}' argument to \`-v' not in \`var=value' form\n`);
        return 2;
      }
    }
    const compileRe = (re: string) =>
      buildRegex(parseRegex(re, { extended: true, awk: true }), { budget });
    items = new AwkParser(lex(src), compileRe).program();
  } catch (e) {
    if (e instanceof AwkSyntaxError) {
      ctx.stderr.write(syntaxMessage(src, e.pos, e.message));
      return 1;
    }
    if (e instanceof Unsupported) return notAvailable(ctx, e.message);
    if (e instanceof RegexSyntaxError) return fatal(e.message);
    if (e instanceof RegexUnsupportedError) return fail(ctx, e.message, 2);
    throw e;
  }

  const begins = items.filter((i) => i.kind === "begin");
  const mains = items.filter((i) => i.kind === "main");
  const ends = items.filter((i) => i.kind === "end");
  let exitCode = 0;

  const runtimeError = (e: unknown): number => {
    if (e instanceof Fatal) return fatal(e.message);
    if (e instanceof Unsupported) return notAvailable(ctx, e.message);
    if (e instanceof RegexSyntaxError) return fatal(e.message);
    if (e instanceof RegexUnsupportedError) return fail(ctx, e.message, 2);
    if (e instanceof RegexLimitError) return fatal(e.message);
    throw e;
  };
  const runEnds = (): number => {
    try {
      for (const it of ends) rt.exec(it.action!);
    } catch (e) {
      if (e instanceof ExitSignal) return e.code >= 0 ? e.code : exitCode;
      if (e instanceof NextSignal) return fatal("`next' used in END action");
      return runtimeError(e);
    }
    return exitCode;
  };

  try {
    try {
      for (const it of begins) rt.exec(it.action!);
    } catch (e) {
      if (e instanceof ExitSignal) {
        exitCode = e.code >= 0 ? e.code : 0;
        return runEnds();
      }
      if (e instanceof NextSignal) return fatal("`next' used in BEGIN action");
      throw e;
    }
    if (mains.length === 0 && ends.length === 0) return 0;

    const inputs = operands.filter((o) => !(VAR_NAME.test(o.split("=")[0]!) && o.includes("=")));
    const queue = inputs.length > 0 ? operands : [...operands, "-"];
    for (const op of queue) {
      if (op.includes("=") && assign(op)) continue;
      const read = readInput(ctx, op);
      if (!read.ok) {
        if (read.error.code === "EISDIR") {
          ctx.stderr.write(
            `awk: warning: command line argument \`${op}' is a directory: skipped\n`,
          );
          continue;
        }
        return fatal(`cannot open file \`${op}' for reading: ${read.error.message}`);
      }
      rt.filename = op === "-" ? "" : op;
      rt.fnr = 0;
      for (const line of splitLines(textOf(read.content))) {
        rt.nr++;
        rt.fnr++;
        rt.setRecord(line);
        try {
          for (const it of mains) {
            if (it.pattern && !toBool(rt.eval(it.pattern))) continue;
            if (it.action) rt.exec(it.action);
            else out(rt.record + rt.toStr(rt.getVar("ORS")));
          }
        } catch (e) {
          if (e instanceof NextSignal) continue;
          throw e;
        }
      }
    }
  } catch (e) {
    if (e instanceof ExitSignal) {
      exitCode = e.code >= 0 ? e.code : 0;
      return runEnds();
    }
    return runtimeError(e);
  }
  return runEnds();
}

export const awkCommand: CommandSpec = {
  name: "awk",
  summary: "print fields: awk [-F SEP] '{print $1, $NF, $(NF-3)}'",
  run: awk,
};
