// Tab completion for the lab terminal (T-702): command names in command
// position (start of line, after `|`, `;`, `&&`, `||`), file and directory
// names everywhere else. Like bash: a single match is completed (with `/` for a
// directory, a space otherwise); several matches complete their common prefix,
// and when nothing more can be added the caller lists them.
//
// Pure: reads the VFS, never changes it.

import type { Vfs } from "./vfs";

export interface Completion {
  /** The new line and cursor position (unchanged if nothing was added). */
  line: string;
  cursor: number;
  /** Every match, as shown in a listing (directories end in `/`). */
  matches: string[];
}

/** Characters that end a word outside quotes. */
const WORD_BREAK = /[\s|;&<>]/;
/** Words we don't try to complete (quotes, variables, globs, escapes). */
const UNSAFE = /['"$*?[\]\\`]/;
const SHELL_SPECIAL = /([\s|;&<>()'"$`\\*?[\]#~])/g;

function commonPrefix(values: readonly string[]): string {
  if (values.length === 0) return "";
  let prefix = values[0]!;
  for (const v of values) {
    let i = 0;
    while (i < prefix.length && i < v.length && prefix[i] === v[i]) i++;
    prefix = prefix.slice(0, i);
  }
  return prefix;
}

/** Start of the word that ends at `cursor`, or -1 inside quotes. */
function wordStart(line: string, cursor: number): number {
  let start = 0;
  let quote: string | undefined;
  for (let i = 0; i < cursor; i++) {
    const ch = line[i]!;
    if (quote) {
      if (ch === quote) quote = undefined;
    } else if (ch === "\\") {
      i++;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (WORD_BREAK.test(ch)) {
      start = i + 1;
    }
  }
  return quote ? -1 : start;
}

/** True if the word starting at `start` is a command name. */
function isCommandPosition(line: string, start: number): boolean {
  const before = line.slice(0, start).trimEnd();
  if (before === "") return true;
  const last = before[before.length - 1]!;
  if (last === "|" || last === ";") return true;
  return before.endsWith("&&");
}

function pathMatches(vfs: Vfs, word: string): { insertFrom: number; names: string[] } {
  const slash = word.lastIndexOf("/");
  const dirPart = slash === -1 ? "" : word.slice(0, slash + 1);
  const prefix = word.slice(slash + 1);
  const dir = dirPart === "" ? "." : dirPart;
  let names: string[];
  try {
    if (!vfs.isDir(dir)) return { insertFrom: dirPart.length, names: [] };
    names = vfs.list(dir);
  } catch {
    return { insertFrom: dirPart.length, names: [] };
  }
  const base = dirPart === "" ? "" : dirPart;
  return {
    insertFrom: dirPart.length,
    names: names
      .filter((n) => n.startsWith(prefix) && (prefix.startsWith(".") || !n.startsWith(".")))
      .map((n) => (vfs.isDir(base + n) ? `${n}/` : n)),
  };
}

/**
 * Complete the word before `cursor`. Returns undefined when there is nothing
 * to complete (empty word in command position, inside quotes, globs …), so
 * the caller can let Tab move focus as usual.
 */
export function complete(
  line: string,
  cursor: number,
  vfs: Vfs,
  commands: readonly string[],
): Completion | undefined {
  const start = wordStart(line, cursor);
  if (start < 0) return undefined;
  const word = line.slice(start, cursor);
  if (UNSAFE.test(word)) return undefined;

  let candidates: string[];
  let offset: number; // where in `word` the candidate names begin
  if (isCommandPosition(line, start) && !word.includes("/")) {
    if (word === "") return undefined;
    candidates = commands.filter((c) => c.startsWith(word));
    offset = 0;
  } else {
    const m = pathMatches(vfs, word);
    candidates = m.names;
    offset = m.insertFrom;
  }
  if (candidates.length === 0) return { line, cursor, matches: [] };

  const typed = word.slice(offset);
  let insert: string;
  if (candidates.length === 1) {
    const only = candidates[0]!;
    insert = only.slice(typed.length).replace(SHELL_SPECIAL, "\\$1");
    if (!only.endsWith("/")) insert += " ";
  } else {
    insert = commonPrefix(candidates).slice(typed.length).replace(SHELL_SPECIAL, "\\$1");
  }
  return {
    line: line.slice(0, cursor) + insert + line.slice(cursor),
    cursor: cursor + insert.length,
    matches: candidates,
  };
}
