// Byte/text streams for the terminal lab runner (T-702, LLD §13.1).
//
// A command reads `stdin` (an Input) and writes to `stdout`/`stderr` (Outputs).
// Text stays a string end to end, so pipelines of text commands never pay for
// UTF-8 round trips; binary data (the Lab B installers) stays bytes so hashes
// are real. Every Output has a byte budget: going over it throws
// OutputLimitError, which stops a runaway command instead of hanging the tab.

import { contentBytes, contentText, type FileContent } from "./vfs";

const encoder = new TextEncoder();

/** UTF-8 length of a string without encoding it. */
export function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

function chunkLength(chunk: FileContent): number {
  return typeof chunk === "string" ? utf8Length(chunk) : chunk.length;
}

/** Thrown by Output.write when a stream goes over its byte budget. */
export class OutputLimitError extends Error {
  constructor(readonly limit: number) {
    super(`output limit of ${limit} bytes exceeded`);
    this.name = "OutputLimitError";
  }
}

/** Where a command writes. */
export interface Output {
  write(chunk: FileContent): void;
  /** True for the screen (like isatty(1)); `ls` then prints columns. */
  readonly isTerminal?: boolean;
}

/** What a command reads. Terminal stdin is empty (as if `< /dev/null`). */
export class Input {
  private textCache: string | undefined;
  private bytesCache: Uint8Array | undefined;

  constructor(
    private readonly data: FileContent = "",
    /** True when nothing is piped or redirected in. */
    readonly isTerminal = false,
  ) {}

  /** The content as stored: a string for text, bytes for binary data. */
  content(): FileContent {
    return this.data;
  }

  text(): string {
    return (this.textCache ??= contentText(this.data));
  }

  bytes(): Uint8Array {
    return (this.bytesCache ??= contentBytes(this.data));
  }
}

/** Collects everything written, up to `limit` bytes (pipes and `>` files). */
export class BufferOutput implements Output {
  private readonly chunks: FileContent[] = [];
  private size = 0;

  constructor(readonly limit: number) {}

  get byteLength(): number {
    return this.size;
  }

  write(chunk: FileContent): void {
    const n = chunkLength(chunk);
    if (n === 0) return;
    if (this.size + n > this.limit) throw new OutputLimitError(this.limit);
    this.size += n;
    this.chunks.push(chunk);
  }

  /** A string if only strings were written (or nothing), else bytes. */
  content(): FileContent {
    if (this.chunks.every((c) => typeof c === "string")) return this.chunks.join("");
    const out = new Uint8Array(this.size);
    let at = 0;
    for (const c of this.chunks) {
      const b = typeof c === "string" ? encoder.encode(c) : c;
      out.set(b, at);
      at += b.length;
    }
    return out;
  }
}

/** `/dev/null`. */
export const NULL_OUTPUT: Output = { write() {} };

export type TerminalStream = "stdout" | "stderr";

/** One piece of terminal output, in the order it was written. */
export type TerminalChunk =
  { type: "text"; stream: TerminalStream; text: string } | { type: "clear" };

/**
 * The screen for one command line: stdout and stderr interleaved in write
 * order, with a shared byte budget. When the budget runs out the text is cut at
 * the limit and the writing command is stopped.
 */
export class TerminalOutput {
  readonly chunks: TerminalChunk[] = [];
  private size = 0;
  private readonly decoders = { stdout: new TextDecoder(), stderr: new TextDecoder() };
  truncated = false;

  constructor(readonly limit: number) {}

  stream(stream: TerminalStream): Output {
    return { write: (chunk) => this.write(stream, chunk), isTerminal: true };
  }

  clear(): void {
    this.chunks.push({ type: "clear" });
  }

  /** Everything written to one stream (after the last clear), for tests. */
  text(stream?: TerminalStream): string {
    let out = "";
    for (const c of this.chunks) {
      if (c.type === "clear") out = "";
      else if (!stream || c.stream === stream) out += c.text;
    }
    return out;
  }

  private write(stream: TerminalStream, chunk: FileContent): void {
    if (this.truncated) throw new OutputLimitError(this.limit);
    const n = chunkLength(chunk);
    if (n === 0) return;
    let text =
      typeof chunk === "string" ? chunk : this.decoders[stream].decode(chunk, { stream: true });
    const over = this.size + n > this.limit;
    if (over) {
      // Cut at roughly the remaining budget (characters, close enough for a notice).
      text = text.slice(0, Math.max(0, this.limit - this.size));
      this.truncated = true;
    }
    this.size += n;
    if (text) this.push(stream, text);
    if (over) throw new OutputLimitError(this.limit);
  }

  private push(stream: TerminalStream, text: string): void {
    const last = this.chunks[this.chunks.length - 1];
    if (last?.type === "text" && last.stream === stream) last.text += text;
    else this.chunks.push({ type: "text", stream, text });
  }

  /** Writes past the budget, used for the runner's own truncation notice. */
  note(stream: TerminalStream, text: string): void {
    this.push(stream, text);
  }
}
