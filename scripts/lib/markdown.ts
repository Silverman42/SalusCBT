// Line-level Markdown helpers for the exam parser. Only the subset the source
// file uses is supported; everything is fence-aware so `# comment` lines in
// shell/config blocks are never mistaken for headings.

import type { ParseIssue } from "./types";

export type Line = {
  no: number; // 1-based line number in the source file
  text: string; // without the trailing newline / carriage return
  inFence: boolean; // content line inside a ``` block
  fence: "open" | "close" | null; // the ``` marker line itself
  lang?: string; // info string on an opening fence
};

/** Collects issues; every parser stage reports into one list so all problems print at once. */
export class Issues {
  readonly list: ParseIssue[] = [];
  add(line: number | null, message: string): void {
    this.list.push({ line, message });
  }
  get count(): number {
    return this.list.length;
  }
}

export function scanLines(source: string, issues: Issues): Line[] {
  const raw = source.replace(/\r\n?/g, "\n").split("\n");
  const lines: Line[] = [];
  let open: Line | null = null;
  raw.forEach((text, i) => {
    const no = i + 1;
    const marker = /^```(.*)$/.exec(text);
    if (marker) {
      const lang = marker[1]!.trim();
      if (open && lang !== "") {
        // A closing fence has no info string, so ```text here means the
        // previous block was never closed. Report it there and recover.
        issues.add(open.no, `code fence is not closed before the next fence on line ${no}`);
        open = null;
      }
      if (open) {
        lines.push({ no, text, inFence: false, fence: "close" });
        open = null;
      } else {
        const line: Line = { no, text, inFence: false, fence: "open", lang };
        lines.push(line);
        open = line;
      }
      return;
    }
    lines.push({ no, text, inFence: open !== null, fence: null });
  });
  if (open) issues.add((open as Line).no, "code fence is never closed");
  return lines;
}

/** A prose line: not inside a fence and not a fence marker. */
export const isProse = (line: Line) => !line.inFence && line.fence === null;

export type Section = { heading: Line; title: string; body: Line[] };

/**
 * Split `lines` at headings of exactly `level` (`#` count) outside fences.
 * Lines before the first heading are returned as `preamble`.
 */
export function splitSections(
  lines: Line[],
  level: number,
): { preamble: Line[]; sections: Section[] } {
  const prefix = "#".repeat(level) + " ";
  const preamble: Line[] = [];
  const sections: Section[] = [];
  for (const line of lines) {
    if (isProse(line) && line.text.startsWith(prefix)) {
      sections.push({ heading: line, title: line.text.slice(prefix.length).trim(), body: [] });
    } else if (sections.length > 0) {
      sections.at(-1)!.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  return { preamble, sections };
}

/** Text of the lines with trailing blank lines removed. */
export function joinLines(lines: Line[]): string {
  return lines
    .map((l) => l.text)
    .join("\n")
    .replace(/\s+$/, "");
}

/** Prose paragraphs (blank-line separated, fences excluded), each joined with spaces. */
export function paragraphs(lines: Line[]): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let current: { parts: string[]; line: number } | null = null;
  for (const line of lines) {
    const text = line.text.trim();
    if (!isProse(line) || text === "" || text === "---") {
      if (current) out.push({ text: current.parts.join(" "), line: current.line });
      current = null;
      continue;
    }
    if (!current) current = { parts: [], line: line.no };
    current.parts.push(text);
  }
  if (current) out.push({ text: current.parts.join(" "), line: current.line });
  return out;
}

/**
 * Split a table row into trimmed cells. Pipes inside backtick code spans or
 * escaped as `\|` do not split. Returns null when the line is not a table row.
 */
export function tableCells(text: string): string[] | null {
  const t = text.trim();
  if (!t.startsWith("|") || !t.endsWith("|") || t.length < 2) return null;
  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  for (let i = 1; i < t.length; i++) {
    const ch = t[i]!;
    if (ch === "\\" && t[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (ch === "`") {
      inCode = !inCode;
      cell += ch;
    } else if (ch === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += ch;
    }
  }
  return cells;
}

/** `|---|---|` style separator row. */
export const isTableSeparator = (cells: string[]) => cells.every((c) => /^:?-{3,}:?$/.test(c));

export type TableRow = { cells: string[]; line: number };

/**
 * The data rows of the first table in `lines` (header and separator removed).
 * Returns null when there is no table.
 */
export function readTable(lines: Line[]): { header: string[]; rows: TableRow[] } | null {
  let header: string[] | null = null;
  const rows: TableRow[] = [];
  for (const line of lines) {
    if (!isProse(line)) continue;
    const cells = tableCells(line.text);
    if (!cells) {
      if (header) break; // the table ended
      continue;
    }
    if (!header) header = cells;
    else if (!isTableSeparator(cells)) rows.push({ cells, line: line.no });
  }
  return header ? { header, rows } : null;
}

/** All `**bold**` spans in a line, trimmed. */
export const boldSpans = (text: string) =>
  [...text.matchAll(/\*\*(.+?)\*\*/g)].map((m) => m[1]!.trim());

export const stripBold = (text: string) => text.replace(/\*\*(.+?)\*\*/g, "$1");
