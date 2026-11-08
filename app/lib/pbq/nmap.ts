/**
 * Pure helpers for the nmap PBQ (T-303, LLD §14.4): parse `nmap -sV` output
 * into port rows, and edit `port` / `portPair` answers. No Vue or DOM.
 *
 * Answers keep exactly what the student typed or picked; the server trims and
 * validates ports when marking (LLD §8.1). `portPair` answers are
 * `[cleartext, secure]`, or `[]` once both inputs are empty.
 */
import type { AnswerValue, PortPart } from "../../../shared/content";
import { setPbqPart } from "../examRunner";

export type NmapPortRow = {
  /** "23" */
  port: string;
  /** "tcp" */
  protocol: string;
  state: string;
  service: string;
  version: string;
};

/** Lines before the PORT table, the table itself, and the lines after it. */
export type NmapScan = {
  before: string[];
  header: string | null;
  rows: NmapPortRow[];
  after: string[];
};

const HEADER = /^PORT\s+STATE\s+SERVICE\b/;
const ROW = /^(\d{1,5})\/([a-z]+)\s+(\S+)\s+(\S+)(?:\s+(.*))?$/;

/** Split the scan around its PORT table. With no table, every line is in `before`. */
export function parseNmapScan(scan: string): NmapScan {
  const lines = scan.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  const h = lines.findIndex((l) => HEADER.test(l));
  if (h === -1) return { before: lines, header: null, rows: [], after: [] };
  const rows: NmapPortRow[] = [];
  let i = h + 1;
  for (; i < lines.length; i++) {
    const m = ROW.exec(lines[i] ?? "");
    if (!m) break;
    rows.push({
      port: m[1] ?? "",
      protocol: m[2] ?? "",
      state: m[3] ?? "",
      service: m[4] ?? "",
      version: (m[5] ?? "").trim(),
    });
  }
  return { before: lines.slice(0, h), header: lines[h] ?? null, rows, after: lines.slice(i) };
}

/** The command from a leading prompt line ("analyst@kali:~$ nmap -sV 10.0.5.20"), else "nmap -sV". */
export function scanTitle(scan: NmapScan): string {
  const m = /^\S+[$#]\s+(nmap\b.*)$/.exec(scan.before[0] ?? "");
  return m?.[1]?.trim() || "nmap -sV";
}

/** An answer input: a `port` part (side 0) or one side of a `portPair` part. */
export type PortSlot = { partId: string; side: 0 | 1 };

export const sameSlot = (a: PortSlot | null, b: PortSlot) =>
  a !== null && a.partId === b.partId && a.side === b.side;

/** Every input in reading order: one per `port` part, two per `portPair` part. */
export function portSlots(parts: PortPart[]): PortSlot[] {
  return parts.flatMap((p): PortSlot[] =>
    p.kind === "portPair"
      ? [
          { partId: p.id, side: 0 },
          { partId: p.id, side: 1 },
        ]
      : [{ partId: p.id, side: 0 }],
  );
}

/** The text in a slot ("" when unanswered). */
export function slotValue(value: AnswerValue | undefined, slot: PortSlot): string {
  const a = value?.kind === "pbq" ? value.parts[slot.partId] : undefined;
  if (Array.isArray(a)) return a[slot.side] ?? "";
  return slot.side === 0 && typeof a === "string" ? a : "";
}

/** Write `text` into a slot; `null` when every part is then empty. */
export function setSlot(
  value: AnswerValue | undefined,
  part: PortPart,
  side: 0 | 1,
  text: string,
): AnswerValue | null {
  if (part.kind === "port") return setPbqPart(value, part.id, text);
  const pair: [string, string] = [
    slotValue(value, { partId: part.id, side: 0 }),
    slotValue(value, { partId: part.id, side: 1 }),
  ];
  pair[side] = text;
  return setPbqPart(value, part.id, pair[0] === "" && pair[1] === "" ? [] : pair);
}

/**
 * Where a row pick goes next: the first empty slot after `from` (wrapping),
 * or `from` itself when every slot is filled.
 */
export function nextEmptySlot(
  parts: PortPart[],
  value: AnswerValue | undefined,
  from: PortSlot,
): PortSlot {
  const slots = portSlots(parts);
  const at = slots.findIndex((s) => sameSlot(from, s));
  for (let k = 1; k <= slots.length; k++) {
    const s = slots[(at + k) % slots.length];
    if (s && slotValue(value, s) === "") return s;
  }
  return from;
}

/** Slot labels ("2a", "B2a cleartext") that currently hold `port`, for the row badges. */
export function slotsHoldingPort(
  parts: PortPart[],
  value: AnswerValue | undefined,
  port: string,
): string[] {
  return portSlots(parts)
    .filter((s) => slotValue(value, s).trim() === port)
    .map((s) => slotLabel(parts, s));
}

/** Short label for a slot: "2a", or "B2a cleartext" / "B2a secure" for pairs. */
export function slotLabel(parts: PortPart[], slot: PortSlot): string {
  const part = parts.find((p) => p.id === slot.partId);
  if (part?.kind !== "portPair") return slot.partId;
  return `${slot.partId} ${slot.side === 0 ? "cleartext" : "secure"}`;
}
