// grep for Labs A and C (T-704, LLD §13.2, LB-2).
//
// GNU grep 3.11 behaviour: basic regular expressions by default (with GNU's
// `\|`, `\+`, `\?`, `\<`, `\>`, `\w`), -E extended, -F fixed strings. Prefixes
// `file:` with several files and `N:` with -n; -o prints each match on its own
// line; -c prints counts; binary files print "binary file matches" to stderr.
// Exit status 0 if a line was selected, 1 if none, 2 on an error.
// Not available: -r, context (-A/-B/-C), -P, colour.

import { fail, type CommandContext, type CommandSpec } from "../command";
import { buildRegex, literalNode, newBudget, parseRegex, wrapNode, type RegexNode } from "./regex";
import {
  isBinary,
  lastValue,
  parseOpts,
  readInput,
  splitLines,
  textOf,
  withRegexErrors,
} from "./textUtil";

function grep(ctx: CommandContext): number {
  const opts = parseOpts(ctx, {
    flags: "cinvoEFGwxhHlqsa",
    values: "em",
    long: {
      count: { key: "c" },
      "ignore-case": { key: "i" },
      "line-number": { key: "n" },
      "invert-match": { key: "v" },
      "only-matching": { key: "o" },
      "extended-regexp": { key: "E" },
      "fixed-strings": { key: "F" },
      "basic-regexp": { key: "G" },
      "word-regexp": { key: "w" },
      "line-regexp": { key: "x" },
      "no-filename": { key: "h" },
      "with-filename": { key: "H" },
      "files-with-matches": { key: "l" },
      quiet: { key: "q" },
      silent: { key: "q" },
      "no-messages": { key: "s" },
      text: { key: "a" },
      regexp: { key: "e", value: true },
      "max-count": { key: "m", value: true },
    },
  });
  if (!opts) return 2;
  const f = opts.flags;
  const operands = [...opts.operands];

  let patternText: string;
  const given = opts.values.get("e");
  if (given) {
    patternText = given.join("\n");
  } else {
    const first = operands.shift();
    if (first === undefined) {
      ctx.stderr.write("Usage: grep [OPTION]... PATTERNS [FILE]...\n");
      ctx.stderr.write("Try 'grep --help' for more information.\n");
      return 2;
    }
    patternText = first;
  }

  let maxCount = Infinity;
  const m = lastValue(opts, "m");
  if (m !== undefined) {
    if (!/^-?\d+$/.test(m)) return fail(ctx, "invalid max count", 2);
    const n = Number(m);
    maxCount = n < 0 ? Infinity : n;
  }

  // GNU: the last of -E, -F, -G wins.
  let mode: "E" | "F" | "G" = "G";
  for (const arg of ctx.args) {
    if (/^-[cinvoEFGwxhHlqsa]+$/.test(arg)) {
      for (const c of arg.slice(1)) if (c === "E" || c === "F" || c === "G") mode = c;
    } else if (arg === "--extended-regexp") mode = "E";
    else if (arg === "--fixed-strings") mode = "F";
    else if (arg === "--basic-regexp") mode = "G";
  }

  return withRegexErrors(ctx, () => {
    const warnings: string[] = [];
    let groups = 0;
    const nodes: RegexNode[] = patternText.split("\n").map((p) => {
      if (mode === "F") return literalNode(p);
      const parsed = parseRegex(p, { extended: mode === "E", warnings, strictClass: true });
      groups = Math.max(groups, parsed.groups);
      return parsed.node;
    });
    for (const w of warnings) ctx.stderr.write(`grep: warning: ${w}\n`);
    let node: RegexNode = nodes.length === 1 ? nodes[0]! : { t: "alt", items: nodes };
    if (f.has("x")) node = wrapNode(node, "line");
    else if (f.has("w")) node = wrapNode(node, "word");
    const regex = buildRegex({ node, groups }, { icase: f.has("i"), budget: newBudget() });

    const files = operands.length > 0 ? operands : ["-"];
    const withName = !f.has("h") && (f.has("H") || files.length > 1);
    let anySelected = false;
    let error = false;

    for (const file of files) {
      const name = file === "-" ? "(standard input)" : file;
      const read = readInput(ctx, file);
      if (!read.ok) {
        error = true;
        if (!f.has("s")) fail(ctx, `${file}: ${read.error.message}`);
        continue;
      }
      const binary = !f.has("a") && isBinary(read.content);
      const lines = splitLines(textOf(read.content));
      const prefixName = withName ? `${name}:` : "";
      let count = 0;

      for (let idx = 0; idx < lines.length && count < maxCount; idx++) {
        const line = lines[idx]!;
        const first = f.has("o") && !f.has("v") ? regex.exec(line, 0) : null;
        const matched = first !== null || (!(f.has("o") && !f.has("v")) && regex.test(line));
        if (matched === f.has("v")) continue;
        count++;
        if (f.has("q")) return 0;
        if (f.has("l")) break;
        if (f.has("c")) continue;
        if (binary) {
          ctx.stderr.write(`grep: ${name}: binary file matches\n`);
          break;
        }
        const prefix = prefixName + (f.has("n") ? `${idx + 1}:` : "");
        if (!f.has("o")) {
          ctx.stdout.write(`${prefix}${line}\n`);
          continue;
        }
        // -o: every non-empty match on its own line (none with -v).
        let match = first;
        while (match) {
          let next = match.end;
          if (match.end > match.start) {
            ctx.stdout.write(`${prefix}${line.slice(match.start, match.end)}\n`);
          } else {
            if (next >= line.length) break;
            next += line.codePointAt(next)! > 0xffff ? 2 : 1;
          }
          if (next > line.length) break;
          match = regex.exec(line, next);
        }
      }
      if (count > 0) anySelected = true;
      if (f.has("l")) {
        if (count > 0) ctx.stdout.write(`${name}\n`);
      } else if (f.has("c")) {
        ctx.stdout.write(`${prefixName}${count}\n`);
      }
    }
    if (error && !(f.has("q") && anySelected)) return 2;
    return anySelected ? 0 : 1;
  });
}

export const grepCommand: CommandSpec = {
  name: "grep",
  summary: "print lines that match a pattern (-c -i -n -v -o -E -F -w -x)",
  run: grep,
};
