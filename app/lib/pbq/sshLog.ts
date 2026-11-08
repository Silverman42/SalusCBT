/**
 * Pure helpers for the SSH log PBQ (T-302, LLD §14.4): split the log into
 * lines and find search matches for highlighting. No Vue or DOM.
 *
 * Search is a literal, case-insensitive substring match (no regex, so any
 * characters a student types are safe). Matches never overlap.
 */

/** One run of a log line: plain text, or a search match with its index across the whole log. */
export type LogSegment = { text: string; match: number | null };

/** A numbered log line split into segments; `hit` when it holds at least one match. */
export type LogLine = { n: number; segments: LogSegment[]; hit: boolean };

/** Lines of the log; a single trailing newline does not add an empty last line. */
export function splitLog(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Split every line around matches of `query`, numbering matches from 0 in reading order. */
export function searchLog(lines: string[], query: string): { lines: LogLine[]; count: number } {
  const needle = query.toLowerCase();
  let count = 0;
  const out = lines.map((line, i): LogLine => {
    if (needle === "") return { n: i + 1, segments: [{ text: line, match: null }], hit: false };
    const hay = line.toLowerCase();
    const segments: LogSegment[] = [];
    let from = 0;
    let at = hay.indexOf(needle);
    while (at !== -1) {
      if (at > from) segments.push({ text: line.slice(from, at), match: null });
      segments.push({ text: line.slice(at, at + needle.length), match: count++ });
      from = at + needle.length;
      at = hay.indexOf(needle, from);
    }
    const hit = from > 0;
    if (from < line.length || segments.length === 0) {
      segments.push({ text: line.slice(from), match: null });
    }
    return { n: i + 1, segments, hit };
  });
  return { lines: out, count };
}

/**
 * The match to go to after pressing next (`+1`) or previous (`-1`), wrapping
 * at both ends. `current` is `null` before the first jump; `null` with no matches.
 */
export function stepMatch(current: number | null, count: number, dir: 1 | -1): number | null {
  if (count === 0) return null;
  if (current === null || current >= count) return dir === 1 ? 0 : count - 1;
  return (current + dir + count) % count;
}

/** Text for the match counter: "50 matches", "3 of 50", "No matches". */
export function matchLabel(current: number | null, count: number): string {
  if (count === 0) return "No matches";
  if (current === null) return count === 1 ? "1 match" : `${count} matches`;
  return `${current + 1} of ${count}`;
}
