// Command history for the lab terminal (T-702, LB-1): ↑ and ↓ walk through the
// lines already run, like bash's readline. The line being typed is kept as a
// draft, so ↓ past the newest entry gives it back. Memory only (LLD §13.2).

export const DEFAULT_HISTORY_SIZE = 200;

export class CommandHistory {
  private readonly entries: string[] = [];
  /** Index into entries while browsing; entries.length means "the draft". */
  private cursor = 0;
  private draft = "";

  constructor(readonly maxEntries: number = DEFAULT_HISTORY_SIZE) {}

  get size(): number {
    return this.entries.length;
  }

  list(): readonly string[] {
    return this.entries;
  }

  /**
   * Record a line that was run. Blank lines and an exact repeat of the last
   * entry are skipped (bash's `ignoreboth` without the leading-space rule).
   */
  push(line: string): void {
    if (line.trim() !== "" && this.entries[this.entries.length - 1] !== line) {
      this.entries.push(line);
      if (this.entries.length > this.maxEntries) {
        this.entries.splice(0, this.entries.length - this.maxEntries);
      }
    }
    this.reset();
  }

  /** ↑: the previous entry, or undefined at the oldest (the line stays as is). */
  up(current: string): string | undefined {
    if (this.cursor === 0) return undefined;
    if (this.cursor === this.entries.length) this.draft = current;
    this.cursor -= 1;
    return this.entries[this.cursor];
  }

  /** ↓: the next entry, then the draft; undefined when already on the draft. */
  down(): string | undefined {
    if (this.cursor >= this.entries.length) return undefined;
    this.cursor += 1;
    return this.cursor === this.entries.length ? this.draft : this.entries[this.cursor];
  }

  /** Stop browsing (after Enter or Ctrl+C). */
  reset(): void {
    this.cursor = this.entries.length;
    this.draft = "";
  }
}
