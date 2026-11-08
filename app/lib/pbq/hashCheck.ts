/**
 * hashCheck PBQ (T-304): line the vendor's published hashes up with the
 * computed ones by file name. Hashes are kept whole (never truncated); the
 * component shows both in full, one above the other, with no hint of which
 * pair differs.
 */
import { splitPrompt } from "./shellPrompt";

export type HashEntry = { hash: string; file: string };
export type HashListing = {
  /** The command that produced the listing, e.g. `cat vendor_hashes.txt`. */
  command: string | null;
  entries: HashEntry[];
  /** Non-blank lines that are neither the prompt nor `hash  file`. */
  unparsed: string[];
};

/** `sha256sum` output: hex digest, two spaces (or ` *` in binary mode), file name. */
const LINE = /^([0-9a-f]{32,128}) [ *](\S(?:.*\S)?)\s*$/i;

export function parseHashListing(text: string): HashListing {
  let command: string | null = null;
  const entries: HashEntry[] = [];
  const unparsed: string[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    const p = splitPrompt(line);
    if (p) {
      command ??= p.command;
      continue;
    }
    const m = LINE.exec(line);
    if (m) entries.push({ hash: m[1] ?? "", file: m[2] ?? "" });
    else unparsed.push(line);
  }
  return { command, entries, unparsed };
}

export type HashRow = { file: string; vendor: string | null; computed: string | null };

/**
 * One row per file in the vendor list's order, then files only the computed
 * list has. `null` when the listings can't be lined up (some line didn't
 * parse, or there are no hashes): show the raw text instead.
 */
export function alignHashes(vendorText: string, computedText: string): HashRow[] | null {
  const vendor = parseHashListing(vendorText);
  const computed = parseHashListing(computedText);
  if (vendor.unparsed.length || computed.unparsed.length) return null;
  if (!vendor.entries.length || !computed.entries.length) return null;
  const rows: HashRow[] = vendor.entries.map((e) => ({
    file: e.file,
    vendor: e.hash,
    computed: computed.entries.find((c) => c.file === e.file)?.hash ?? null,
  }));
  for (const c of computed.entries) {
    if (!rows.some((r) => r.file === c.file)) {
      rows.push({ file: c.file, vendor: null, computed: c.hash });
    }
  }
  return rows;
}
