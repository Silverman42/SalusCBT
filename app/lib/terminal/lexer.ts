// Command-line lexer and parser for the terminal lab (T-702, LLD §13.1).
//
// A small, bash-compatible subset, interpreted in the browser (no eval, no real
// shell):
//
//   words         plain, '…' (literal), "…" (\$ \" \\ \` escapes, $VAR expands),
//                 backslash escapes outside quotes
//   expansions    $VAR, ${VAR}, $? (at run time), ~ and ~/… , globs * ? […]
//   operators     |  &&  ||  ;  (and newlines, read as ;)
//   redirections  >  >>  <  2>  2>>  2>&1  >&2  &>  &>>  (target /dev/null works)
//   comments      # to end of line, at the start of a word
//
// Anything bash would treat as syntax we don't run (`&`, `( )`, `$( )`,
// backticks, here-docs) is rejected with a clear "not available in this lab"
// message instead of being silently misread. Syntax errors use bash's wording.

/** Part of a word. `quoted` text is never globbed or tilde-expanded. */
export type Segment =
  { kind: "text"; text: string; quoted: boolean } | { kind: "var"; name: string; quoted: boolean };

export type Word = Segment[];

export type Operator = "|" | "||" | "&&" | ";";
export type RedirectOp = ">" | ">>" | "<" | ">&" | "&>" | "&>>";

export type Token =
  | { type: "word"; word: Word }
  | { type: "op"; op: Operator }
  | { type: "redirect"; op: RedirectOp; fd: number };

export interface Redirect {
  op: RedirectOp;
  /** File descriptor on the left: 0 for `<`, 1 for `>` unless written (`2>`). */
  fd: number;
  target: Word;
}

export interface SimpleCommand {
  words: Word[];
  redirects: Redirect[];
}

export interface Pipeline {
  commands: SimpleCommand[];
}

export interface AndOrList {
  first: Pipeline;
  rest: { op: "&&" | "||"; pipeline: Pipeline }[];
}

export interface Script {
  lists: AndOrList[];
}

/** A line bash would reject; `message` is what bash prints after `bash: `. */
export class ShellSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ShellSyntaxError";
  }
}

const NAME_START = /[A-Za-z_]/;
const NAME_CHAR = /[A-Za-z0-9_]/;

function notAvailable(what: string): ShellSyntaxError {
  return new ShellSyntaxError(`${what} not available in this lab`);
}

/** Split a command line into tokens. Throws ShellSyntaxError. */
export function tokenize(line: string): Token[] {
  const tokens: Token[] = [];
  let word: Word = [];
  let inWord = false;
  let i = 0;

  const addText = (text: string, quoted: boolean) => {
    inWord = true;
    const last = word[word.length - 1];
    if (last?.kind === "text" && last.quoted === quoted) last.text += text;
    else word.push({ kind: "text", text, quoted });
  };
  const endWord = () => {
    if (inWord) tokens.push({ type: "word", word });
    word = [];
    inWord = false;
  };
  /** `2` just before `>`: an fd number rather than a word. */
  const takeFd = (): number | undefined => {
    const [only] = word;
    if (word.length === 1 && only?.kind === "text" && !only.quoted && /^\d$/.test(only.text)) {
      word = [];
      inWord = false;
      return Number(only.text);
    }
    return undefined;
  };
  /** `$…` at line[i] (which is `$`); returns the new index. */
  const dollar = (quoted: boolean): void => {
    const next = line[i + 1];
    if (next === "(") throw notAvailable("command substitution $(…) is");
    if (next === "?") {
      word.push({ kind: "var", name: "?", quoted });
      inWord = true;
      i += 2;
      return;
    }
    if (next === "{") {
      const close = line.indexOf("}", i + 2);
      const name = close < 0 ? "" : line.slice(i + 2, close);
      if (!/^(?:[A-Za-z_][A-Za-z0-9_]*|\?)$/.test(name)) {
        throw new ShellSyntaxError(
          `${line.slice(i, close < 0 ? undefined : close + 1)}: bad substitution`,
        );
      }
      word.push({ kind: "var", name, quoted });
      inWord = true;
      i = close + 1;
      return;
    }
    if (next !== undefined && NAME_START.test(next)) {
      let j = i + 1;
      while (j < line.length && NAME_CHAR.test(line[j]!)) j++;
      word.push({ kind: "var", name: line.slice(i + 1, j), quoted });
      inWord = true;
      i = j;
      return;
    }
    addText("$", quoted);
    i += 1;
  };

  while (i < line.length) {
    const c = line[i]!;
    const next = line[i + 1];

    if (c === " " || c === "\t") {
      endWord();
      i++;
    } else if (c === "\n" || c === "\r") {
      endWord();
      if (c === "\n") tokens.push({ type: "op", op: ";" });
      i++;
    } else if (c === "#" && !inWord) {
      break; // comment
    } else if (c === "'") {
      const close = line.indexOf("'", i + 1);
      if (close < 0) throw new ShellSyntaxError("unexpected EOF while looking for matching `''");
      addText(line.slice(i + 1, close), true);
      i = close + 1;
    } else if (c === '"') {
      inWord = true;
      i++;
      let closed = false;
      while (i < line.length) {
        const d = line[i]!;
        if (d === '"') {
          closed = true;
          i++;
          break;
        }
        if (d === "\\" && i + 1 < line.length && '$`"\\\n'.includes(line[i + 1]!)) {
          if (line[i + 1] !== "\n") addText(line[i + 1]!, true);
          i += 2;
        } else if (d === "$") {
          dollar(true);
        } else if (d === "`") {
          throw notAvailable("command substitution `…` is");
        } else {
          addText(d, true);
          i++;
        }
      }
      if (!closed) throw new ShellSyntaxError("unexpected EOF while looking for matching `\"'");
    } else if (c === "\\") {
      if (next === undefined)
        i++; // trailing backslash: line continuation, nothing follows
      else if (next === "\n") i += 2;
      else {
        addText(next, true);
        i += 2;
      }
    } else if (c === "$") {
      dollar(false);
    } else if (c === "`") {
      throw notAvailable("command substitution `…` is");
    } else if (c === "|") {
      endWord();
      if (next === "&") throw notAvailable("|& is");
      tokens.push({ type: "op", op: next === "|" ? "||" : "|" });
      i += next === "|" ? 2 : 1;
    } else if (c === "&") {
      endWord();
      if (next === "&") {
        tokens.push({ type: "op", op: "&&" });
        i += 2;
      } else if (next === ">") {
        const append = line[i + 2] === ">";
        tokens.push({ type: "redirect", op: append ? "&>>" : "&>", fd: 1 });
        i += append ? 3 : 2;
      } else {
        throw notAvailable("background jobs (&) are");
      }
    } else if (c === ";") {
      endWord();
      if (next === ";") throw new ShellSyntaxError("syntax error near unexpected token `;;'");
      tokens.push({ type: "op", op: ";" });
      i++;
    } else if (c === ">" || c === "<") {
      const fd = takeFd();
      endWord();
      if (c === "<") {
        if (next === "<") throw notAvailable("here-documents (<<) are");
        if (next === ">" || next === "&" || next === "(") throw notAvailable(`<${next} is`);
        if (fd !== undefined && fd !== 0) throw notAvailable(`${fd}< is`);
        tokens.push({ type: "redirect", op: "<", fd: 0 });
        i++;
      } else if (next === ">") {
        tokens.push({ type: "redirect", op: ">>", fd: fd ?? 1 });
        i += 2;
      } else if (next === "&") {
        tokens.push({ type: "redirect", op: ">&", fd: fd ?? 1 });
        i += 2;
      } else if (next === "|" || next === "(") {
        throw notAvailable(`>${next} is`);
      } else {
        tokens.push({ type: "redirect", op: ">", fd: fd ?? 1 });
        i++;
      }
    } else if (c === "(" || c === ")") {
      throw notAvailable("subshells ( … ) are");
    } else {
      addText(c, false);
      i++;
    }
  }
  endWord();
  return tokens;
}

function describe(token: Token | undefined): string {
  if (!token) return "newline";
  if (token.type === "op") return token.op;
  if (token.type === "redirect") return token.op;
  return wordText(token.word);
}

/** A word's literal text (variables shown as `$NAME`), for messages. */
export function wordText(word: Word): string {
  return word.map((s) => (s.kind === "text" ? s.text : `$${s.name}`)).join("");
}

/** Parse a command line into lists, pipelines and commands. */
export function parse(line: string): Script {
  const tokens = tokenize(line);
  let pos = 0;
  const peek = () => tokens[pos];
  const unexpected = (token: Token | undefined): ShellSyntaxError =>
    token
      ? new ShellSyntaxError(`syntax error near unexpected token \`${describe(token)}'`)
      : new ShellSyntaxError("syntax error: unexpected end of file");

  const command = (): SimpleCommand => {
    const cmd: SimpleCommand = { words: [], redirects: [] };
    for (let t = peek(); t && t.type !== "op"; t = peek()) {
      pos++;
      if (t.type === "word") {
        cmd.words.push(t.word);
      } else {
        const target = peek();
        if (target?.type !== "word") {
          throw new ShellSyntaxError(`syntax error near unexpected token \`${describe(target)}'`);
        }
        pos++;
        cmd.redirects.push({ op: t.op, fd: t.fd, target: target.word });
      }
    }
    if (cmd.words.length === 0 && cmd.redirects.length === 0) throw unexpected(peek());
    return cmd;
  };

  const pipeline = (): Pipeline => {
    const commands = [command()];
    while (peek()?.type === "op" && (peek() as { op: Operator }).op === "|") {
      pos++;
      commands.push(command());
    }
    return { commands };
  };

  const lists: AndOrList[] = [];
  while (pos < tokens.length) {
    const t = peek();
    if (t?.type === "op" && t.op === ";") {
      // A leading or doubled `;` is an error in bash; a trailing one is fine.
      throw unexpected(t);
    }
    const list: AndOrList = { first: pipeline(), rest: [] };
    for (let op = peek(); op?.type === "op" && (op.op === "&&" || op.op === "||"); op = peek()) {
      pos++;
      list.rest.push({ op: op.op, pipeline: pipeline() });
    }
    lists.push(list);
    const sep = peek();
    if (sep === undefined) break;
    if (sep.type === "op" && sep.op === ";") pos++;
    else throw unexpected(sep);
  }
  return { lists };
}
