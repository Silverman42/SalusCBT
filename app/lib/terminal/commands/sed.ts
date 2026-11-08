// sed (T-704, LB-2) for Lab C's `sed -i 's/^PermitRootLogin yes/PermitRootLogin no/'`.
//
// A GNU sed 4.9 subset: options -n, -i[SUFFIX], -e, -E/-r, -s; commands
// `s/re/rep/[g p N I]`, `p`, `d`, `q [code]`, `=`, with line-number, `$` and
// `/re/` addresses, `addr1,addr2` ranges and `!`. Basic regular expressions
// by default (GNU extensions `\|` `\+` `\?`), `&` and `\1`–`\9` in the
// replacement. Error messages use GNU's `-e expression #N, char M:` form.
// Other commands (a i c y n N h g x b t w r …) print "not available in this lab".

import { fail, notAvailable, type CommandContext, type CommandSpec } from "../command";
import { OutputLimitError } from "../io";
import {
  buildRegex,
  newBudget,
  parseRegex,
  RegexSyntaxError,
  RegexUnsupportedError,
  type ParsedRegex,
  type Regex,
  type RegexBudget,
} from "./regex";
import { lastValue, parseOpts, readInput, splitLines, textOf } from "./textUtil";

/** Largest pattern space or in-place file the lab builds (same as a pipe). */
const MAX_BYTES = 8 * 1024 * 1024;

type Address = { k: "line"; n: number } | { k: "last" } | { k: "re"; re: Regex };

type Piece = string | number; // literal text or a group number (0 = whole match)

type Command =
  | { c: "s"; re: Regex; rep: Piece[]; global: boolean; nth: number; print: boolean }
  | { c: "p" }
  | { c: "d" }
  | { c: "=" }
  | { c: "q"; code: number };

interface Entry {
  a1?: Address;
  a2?: Address;
  negate: boolean;
  cmd: Command;
  /** Range state. */
  active: boolean;
  endLine: number;
}

class ScriptError extends Error {
  constructor(
    message: string,
    readonly char: number,
  ) {
    super(message);
  }
}

class Unsupported extends Error {}

const UNSUPPORTED_COMMANDS = "aicyNnPDhHgGxbtTwWrRlzeFQv{}";

interface CompileCtx {
  extended: boolean;
  budget: RegexBudget;
  lastRegex: { re?: Regex; groups: number };
}

class ScriptParser {
  private i = 0;

  constructor(
    private readonly s: string,
    private readonly cc: CompileCtx,
  ) {}

  private err(message: string, at = this.i): never {
    throw new ScriptError(message, at);
  }

  private skipWs(): void {
    while (this.i < this.s.length && /[ \t]/.test(this.s[this.i]!)) this.i++;
  }

  parse(): Entry[] {
    const entries: Entry[] = [];
    for (;;) {
      while (this.i < this.s.length && /[ \t\n;]/.test(this.s[this.i]!)) this.i++;
      if (this.i >= this.s.length) return entries;
      if (this.s[this.i] === "#") {
        while (this.i < this.s.length && this.s[this.i] !== "\n") this.i++;
        continue;
      }
      const entry: Entry = { negate: false, cmd: { c: "p" }, active: false, endLine: 0 };
      entry.a1 = this.address();
      if (entry.a1) {
        this.skipWs();
        if (this.s[this.i] === ",") {
          this.i++;
          this.skipWs();
          if (this.s[this.i] === "+" || this.s[this.i] === "~") {
            throw new Unsupported("an 'addr,+N' or 'addr,~N' address");
          }
          entry.a2 = this.address();
          if (!entry.a2) this.err("unexpected `,'", this.i + 1);
        }
        if (entry.a1.k === "line" && entry.a1.n === 0) {
          this.err("invalid usage of line address 0", this.i);
        }
      } else if (this.s[this.i] === ",") {
        this.err("unexpected `,'", this.i + 1);
      }
      this.skipWs();
      while (this.s[this.i] === "!") {
        entry.negate = true;
        this.i++;
        this.skipWs();
      }
      if (this.i >= this.s.length) this.err("missing command", this.i);
      const c = this.s[this.i]!;
      this.i++;
      switch (c) {
        case "s":
          entry.cmd = this.substitute();
          break;
        case "p":
        case "d":
        case "=":
          entry.cmd = { c };
          break;
        case "q": {
          if (entry.a2) this.err("command only uses one address", this.i);
          this.skipWs();
          const m = /^\d+/.exec(this.s.slice(this.i));
          if (m) this.i += m[0].length;
          entry.cmd = { c: "q", code: m ? Number(m[0]) : 0 };
          break;
        }
        default:
          if (UNSUPPORTED_COMMANDS.includes(c)) throw new Unsupported(`the '${c}' command`);
          this.err(`unknown command: \`${c}'`, this.i);
      }
      this.endOfCommand();
      entries.push(entry);
    }
  }

  private endOfCommand(): void {
    this.skipWs();
    const c = this.s[this.i];
    if (c === undefined || c === ";" || c === "\n") return;
    if (c === "#") return;
    if (c === "}") throw new Unsupported("a command block ({ … })");
    this.err("extra characters after command", this.i + 1);
  }

  private address(): Address | undefined {
    const c = this.s[this.i];
    if (c === undefined) return undefined;
    if (/\d/.test(c)) {
      const m = /^\d+/.exec(this.s.slice(this.i))!;
      this.i += m[0].length;
      if (this.s[this.i] === "~") throw new Unsupported("a 'first~step' address");
      return { k: "line", n: Number(m[0]) };
    }
    if (c === "$") {
      this.i++;
      return { k: "last" };
    }
    if (c === "/" || c === "\\") {
      let delim = "/";
      if (c === "\\") {
        this.i++;
        delim = this.s[this.i] ?? "";
        if (delim === "" || delim === "\n" || delim === "\\") {
          this.err("unterminated address regex", this.i);
        }
      }
      this.i++;
      const src = this.readPart(delim, "unterminated address regex");
      let icase = false;
      while (this.s[this.i] === "I" || this.s[this.i] === "M") {
        if (this.s[this.i] === "M") throw new Unsupported("the M (multi-line) modifier");
        icase = true;
        this.i++;
      }
      return { k: "re", re: this.regex(src, icase) };
    }
    return undefined;
  }

  /**
   * Text up to an unescaped `delim`. In a regex `\delim` becomes delim and
   * `\n` a newline; in a replacement (`rhs`) escapes are kept for
   * replacement() except `\delim`. An unescaped newline is an error.
   */
  private readPart(delim: string, unterminated: string, rhs = false): string {
    let out = "";
    while (this.i < this.s.length) {
      const c = this.s[this.i]!;
      if (c === delim) {
        this.i++;
        return out;
      }
      if (c === "\n") break;
      if (c === "\\") {
        const n = this.s[this.i + 1];
        if (n === undefined) break;
        this.i += 2;
        if (n === delim) out += rhs && (delim === "&" || /\d/.test(delim)) ? "\\" + delim : delim;
        else if (n === "\n") out += "\n";
        else if (n === "n" && !rhs) out += "\n";
        else out += "\\" + n;
        continue;
      }
      out += c;
      this.i++;
    }
    this.err(unterminated, this.s.length);
  }

  private regex(src: string, icase: boolean): Regex {
    if (src === "") {
      if (!this.cc.lastRegex.re) this.err("no previous regular expression", 0);
      return this.cc.lastRegex.re;
    }
    // sed (unlike grep) also knows \t in a regex.
    const text = src.replace(/\\(.)/gs, (m, ch: string) => (ch === "t" ? "\t" : m));
    let parsed: ParsedRegex;
    try {
      parsed = parseRegex(text, { extended: this.cc.extended });
    } catch (e) {
      if (e instanceof RegexSyntaxError) this.err(e.message, this.i);
      throw e;
    }
    const re = buildRegex(parsed, { icase, budget: this.cc.budget });
    this.cc.lastRegex = { re, groups: parsed.groups };
    return re;
  }

  private substitute(): Command {
    const delim = this.s[this.i];
    if (delim === undefined || delim === "\n" || delim === "\\") {
      this.err("unterminated `s' command", this.s.length);
    }
    this.i++;
    const reSrc = this.readPart(delim, "unterminated `s' command");
    const repSrc = this.readPart(delim, "unterminated `s' command", true);
    let global = false;
    let print = false;
    let icase = false;
    let nth: number | undefined;
    for (;;) {
      const c = this.s[this.i];
      if (c === "g") {
        if (global) this.err("multiple `g' options to `s' command", this.i + 1);
        global = true;
      } else if (c === "p") {
        if (print) this.err("multiple `p' options to `s' command", this.i + 1);
        print = true;
      } else if (c === "i" || c === "I") {
        icase = true;
      } else if (c !== undefined && /\d/.test(c)) {
        if (nth !== undefined) this.err("multiple number options to `s' command", this.i + 1);
        const m = /^\d+/.exec(this.s.slice(this.i))!;
        nth = Number(m[0]);
        this.i += m[0].length;
        if (nth === 0) this.err("number option to `s' command may not be zero", this.i);
        continue;
      } else if (c === "w" || c === "e" || c === "m" || c === "M") {
        throw new Unsupported(`the '${c}' option to 's'`);
      } else if (c === undefined || /[ \t\n;#}]/.test(c)) {
        break;
      } else {
        this.err("unknown option to `s'", this.i + 1);
      }
      this.i++;
    }
    const end = this.i;
    const re = this.regex(reSrc, icase);
    const groups = this.cc.lastRegex.groups;
    const rep = this.replacement(repSrc, groups, end);
    return { c: "s", re, rep, global, nth: nth ?? 1, print };
  }

  private replacement(src: string, groups: number, at: number): Piece[] {
    const pieces: Piece[] = [];
    let lit = "";
    const flush = () => {
      if (lit) pieces.push(lit);
      lit = "";
    };
    for (let k = 0; k < src.length; k++) {
      const c = src[k]!;
      if (c === "&") {
        flush();
        pieces.push(0);
        continue;
      }
      if (c !== "\\") {
        lit += c;
        continue;
      }
      const n = src[++k]!;
      if (/[1-9]/.test(n)) {
        const g = Number(n);
        if (g > groups) this.err(`invalid reference \\${g} on \`s' command's RHS`, at);
        flush();
        pieces.push(g);
      } else if (n === "n") lit += "\n";
      else if (n === "t") lit += "\t";
      else if ("LUluE".includes(n)) throw new Unsupported("case conversion (\\U, \\L) in 's'");
      else lit += n;
    }
    flush();
    return pieces;
  }
}

/** Writes lines like GNU sed: a missing final newline is kept. */
class LineWriter {
  private missingNewline = false;
  readonly chunks: string[] = [];
  private size = 0;

  constructor(private readonly sink?: (s: string) => void) {}

  write(text: string, newline: boolean): void {
    let s = this.missingNewline ? "\n" + text : text;
    if (newline) s += "\n";
    this.missingNewline = !newline;
    if (this.sink) {
      this.sink(s);
      return;
    }
    this.size += s.length;
    if (this.size > MAX_BYTES) throw new OutputLimitError(MAX_BYTES);
    this.chunks.push(s);
  }
}

function substitute(ps: string, cmd: Extract<Command, { c: "s" }>): string | undefined {
  let out = "";
  let copied = 0;
  let pos = 0;
  let count = 0;
  let replaced = false;
  let prevEnd = -1;
  while (pos <= ps.length) {
    const m = cmd.re.exec(ps, pos);
    if (!m) break;
    if (m.start === m.end && m.start === prevEnd) {
      // No empty match right after the previous match.
      if (m.start >= ps.length) break;
      pos = m.start + (ps.codePointAt(m.start)! > 0xffff ? 2 : 1);
      continue;
    }
    count++;
    out += ps.slice(copied, m.start);
    if (count >= cmd.nth) {
      for (const p of cmd.rep) {
        if (typeof p === "string") out += p;
        else {
          const s = m.caps[2 * p]!;
          const e = m.caps[2 * p + 1]!;
          if (s >= 0 && e >= 0) out += ps.slice(s, e);
        }
      }
      replaced = true;
      if (out.length > MAX_BYTES) throw new OutputLimitError(MAX_BYTES);
    } else {
      out += ps.slice(m.start, m.end);
    }
    copied = m.end;
    prevEnd = m.end;
    if (replaced && !cmd.global) break;
    if (m.end > m.start) pos = m.end;
    else {
      if (m.end >= ps.length) break;
      pos = m.end + (ps.codePointAt(m.end)! > 0xffff ? 2 : 1);
    }
  }
  if (!replaced) return undefined;
  return out + ps.slice(copied);
}

interface Stream {
  lines: string[];
  /** Whether the last line ended with a newline. */
  finalNewline: boolean;
}

function sed(ctx: CommandContext): number {
  const opts = parseOpts(ctx, {
    flags: "nErs",
    values: "e",
    optional: "i",
    long: {
      quiet: { key: "n" },
      silent: { key: "n" },
      "regexp-extended": { key: "E" },
      separate: { key: "s" },
      "in-place": { key: "i" },
      expression: { key: "e", value: true },
    },
  });
  if (!opts) return 2;
  const f = opts.flags;
  const operands = [...opts.operands];
  let expressions = opts.values.get("e");
  if (!expressions) {
    const script = operands.shift();
    if (script === undefined) {
      ctx.stderr.write("Usage: sed [OPTION]... {script-only-if-no-other-script} [input-file]...\n");
      return 1;
    }
    expressions = [script];
  }
  const inPlace = f.has("i");
  const suffix = lastValue(opts, "i") ?? "";
  if (suffix.includes("*") || suffix.includes("/")) {
    return notAvailable(ctx, "a backup name with '*' or '/'");
  }

  const cc: CompileCtx = {
    extended: f.has("E") || f.has("r"),
    budget: newBudget(),
    lastRegex: { groups: 0 },
  };
  const script: Entry[] = [];
  for (const [n, expr] of expressions.entries()) {
    try {
      script.push(...new ScriptParser(expr, cc).parse());
    } catch (e) {
      if (e instanceof ScriptError) {
        return fail(ctx, `-e expression #${n + 1}, char ${e.char}: ${e.message}`, 1);
      }
      if (e instanceof Unsupported) return notAvailable(ctx, e.message);
      if (e instanceof RegexUnsupportedError) return fail(ctx, e.message, 2);
      throw e;
    }
  }

  if (inPlace && operands.length === 0) return fail(ctx, "no input files", 1);
  const files = operands.length > 0 ? operands : ["-"];
  const separate = inPlace || f.has("s");
  let status = 0;

  // Read inputs up front; GNU reports unreadable files and goes on.
  const inputs: { file: string; stream: Stream }[] = [];
  for (const file of files) {
    const read = readInput(ctx, file);
    if (!read.ok) {
      if (read.error.code === "EISDIR") {
        status = inPlace
          ? fail(ctx, `couldn't edit ${file}: not a regular file`, 4)
          : fail(ctx, `read error on ${file}: Is a directory`, 2);
      } else {
        status = fail(ctx, `can't read ${file}: ${read.error.message}`, 2);
      }
      continue;
    }
    const text = textOf(read.content);
    inputs.push({
      file,
      stream: { lines: splitLines(text), finalNewline: text === "" || text.endsWith("\n") },
    });
  }

  const groupsOf: { file?: string; streams: Stream[] }[] = separate
    ? inputs.map((x) => ({ file: x.file, streams: [x.stream] }))
    : [{ streams: inputs.map((x) => x.stream) }];

  const stdout = new LineWriter((s) => ctx.stdout.write(s));
  let quit: number | undefined;

  for (const group of groupsOf) {
    const out = inPlace ? new LineWriter() : stdout;
    for (const e of script) e.active = false;
    // GNU keeps a missing final newline only on the very last input line.
    const all = group.streams.flatMap((s) => s.lines);
    const finalNewline = group.streams[group.streams.length - 1]?.finalNewline ?? true;

    for (let idx = 0; idx < all.length && quit === undefined; idx++) {
      const line = all[idx]!;
      const lineNo = idx + 1;
      const last = idx === all.length - 1;
      const newline = !last || finalNewline;
      let ps = line;
      let deleted = false;

      const matches = (a: Address): boolean =>
        a.k === "line" ? a.n === lineNo : a.k === "last" ? last : a.re.test(ps);
      const selected = (e: Entry): boolean => {
        if (!e.a1) return true;
        if (!e.a2) return matches(e.a1);
        if (e.active) {
          if (e.a2.k === "line" ? lineNo >= e.a2.n : matches(e.a2)) e.active = false;
          return true;
        }
        if (!matches(e.a1)) return false;
        if (e.a2.k === "line") e.active = e.a2.n > lineNo;
        else if (e.a2.k === "last") e.active = !last;
        else e.active = true;
        return true;
      };

      for (const e of script) {
        if (selected(e) === e.negate) continue;
        const cmd = e.cmd;
        if (cmd.c === "p") out.write(ps, newline);
        else if (cmd.c === "=") out.write(String(lineNo), true);
        else if (cmd.c === "d") {
          deleted = true;
          break;
        } else if (cmd.c === "q") {
          quit = cmd.code;
          break;
        } else {
          const result = substitute(ps, cmd);
          if (result !== undefined) {
            ps = result;
            if (cmd.print) out.write(ps, newline);
          }
        }
      }
      if (!deleted && !f.has("n")) out.write(ps, newline);
    }

    if (inPlace && group.file !== undefined) {
      const text = out.chunks.join("");
      if (suffix) ctx.vfs.writeFile(group.file + suffix, ctx.vfs.read(group.file));
      ctx.vfs.writeFile(group.file, text);
    }
    if (quit !== undefined) break;
  }
  return quit ?? status;
}

export const sedCommand: CommandSpec = {
  name: "sed",
  summary: "edit text: sed [-n] [-i] 's/old/new/[g]', p, d",
  run: sed,
};
