// Scrollback for the lab terminal (T-702): what Terminal.vue renders. Each
// entry is a command line (with its prompt) or a run of stdout/stderr text.
// Rendered as text nodes only (never HTML), with control characters replaced.
// The scrollback is capped by lines and characters; the oldest text goes first.
//
// `announcement()` gives the bounded text a screen reader hears after each
// command, so a long `cat auth.log` doesn't flood the live region.

import type { TerminalChunk } from "./io";

export type ScreenEntry =
  | { id: number; kind: "command"; prompt: string; text: string }
  | { id: number; kind: "output"; stream: "stdout" | "stderr"; text: string };

export interface ScreenLimits {
  maxLines: number;
  maxChars: number;
}

export const DEFAULT_SCREEN_LIMITS: ScreenLimits = { maxLines: 2000, maxChars: 512 * 1024 };

/** C0 controls (except tab and newline), DEL and C1 controls show as U+FFFD. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

export function printable(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(CONTROL, "�");
}

function countLines(text: string): number {
  let n = 0;
  for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) n++;
  return text.endsWith("\n") ? n : n + 1;
}

export class Screen {
  entries: ScreenEntry[] = [];
  private nextId = 1;
  private lines = 0;
  private chars = 0;

  constructor(readonly limits: ScreenLimits = DEFAULT_SCREEN_LIMITS) {}

  clear(): void {
    this.entries = [];
    this.lines = 0;
    this.chars = 0;
  }

  command(prompt: string, text: string): void {
    this.add({ id: this.nextId++, kind: "command", prompt, text: printable(text) });
  }

  output(stream: "stdout" | "stderr", text: string): void {
    if (text === "") return;
    const clean = printable(text);
    const last = this.entries[this.entries.length - 1];
    if (last?.kind === "output" && last.stream === stream && last.text.endsWith("\n") === false) {
      // Continue an unterminated line (e.g. `echo -n`).
      this.remove(last);
      this.entries.pop();
      this.add({ ...last, text: last.text + clean });
      return;
    }
    this.add({ id: this.nextId++, kind: "output", stream, text: clean });
  }

  /** Apply a command's output in order; returns the text shown since the last clear. */
  apply(chunks: readonly TerminalChunk[]): string {
    let shown = "";
    for (const c of chunks) {
      if (c.type === "clear") {
        this.clear();
        shown = "";
      } else {
        this.output(c.stream, c.text);
        shown += c.text;
      }
    }
    return shown;
  }

  /** Everything on screen as plain text (for "Copy output"). */
  text(): string {
    return this.entries
      .map((e) => (e.kind === "command" ? `${e.prompt}${e.text}\n` : e.text))
      .join("");
  }

  private add(entry: ScreenEntry): void {
    this.entries.push(entry);
    this.lines += this.entryLines(entry);
    this.chars += entry.text.length;
    this.trim();
  }

  private remove(entry: ScreenEntry): void {
    this.lines -= this.entryLines(entry);
    this.chars -= entry.text.length;
  }

  private entryLines(entry: ScreenEntry): number {
    return entry.kind === "command" ? 1 : countLines(entry.text);
  }

  private trim(): void {
    const { maxLines, maxChars } = this.limits;
    while ((this.lines > maxLines || this.chars > maxChars) && this.entries.length > 0) {
      const first = this.entries[0]!;
      const overLines = this.lines - maxLines;
      const overChars = this.chars - maxChars;
      if (first.kind === "output") {
        // Drop whole lines from the front of the oldest block.
        let cut = 0;
        let dropped = 0;
        while (cut < first.text.length && (dropped < overLines || cut < overChars)) {
          const nl = first.text.indexOf("\n", cut);
          cut = nl === -1 ? first.text.length : nl + 1;
          dropped++;
        }
        if (cut < first.text.length) {
          this.remove(first);
          const rest = { ...first, text: first.text.slice(cut) };
          this.entries[0] = rest;
          this.lines += this.entryLines(rest);
          this.chars += rest.text.length;
          continue;
        }
      }
      this.remove(first);
      this.entries.shift();
    }
  }
}

export interface AnnounceLimits {
  maxLines: number;
  maxChars: number;
}

export const DEFAULT_ANNOUNCE_LIMITS: AnnounceLimits = { maxLines: 12, maxChars: 1200 };

/**
 * What a screen reader hears after a command: its output, cut to a few lines,
 * with a note on how much more there is. Empty output → "" (nothing to say).
 */
export function announcement(
  output: string,
  limits: AnnounceLimits = DEFAULT_ANNOUNCE_LIMITS,
): string {
  const text = printable(output).replace(/\n+$/, "");
  if (text.trim() === "") return "";
  const lines = text.split("\n");
  let kept = lines.slice(0, limits.maxLines).join("\n");
  if (kept.length > limits.maxChars) kept = kept.slice(0, limits.maxChars) + "…";
  const keptLines = Math.min(lines.length, limits.maxLines);
  const more = lines.length - keptLines;
  if (more > 0) {
    kept += `\n… ${more} more ${more === 1 ? "line" : "lines"}. Read them in the terminal output.`;
  }
  return kept;
}
