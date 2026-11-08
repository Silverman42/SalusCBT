/**
 * Class results CSV (LLD §5.2 `classes.exportCsv`, PRD CL-8).
 *
 * Pure functions, so escaping is testable without a database.
 *
 * - RFC 4180: comma separated, CRLF line endings, a field containing a comma,
 *   double quote, CR or LF is wrapped in double quotes with inner quotes
 *   doubled.
 * - Formula injection: display names are typed by students, so any text cell
 *   starting with `=`, `+`, `-`, `@`, tab or CR gets a leading `'`, which
 *   Excel, Sheets and LibreOffice show as plain text instead of evaluating.
 *   Numeric cells are written by us and never negative, so they are left
 *   alone.
 * - The string starts with a UTF-8 byte order mark so Excel reads non-ASCII
 *   names correctly (Sheets ignores it).
 *
 * Privacy: built from `attemptRow`-style fields only; `anonKey`, `ipHash`,
 * share links and tokens are never columns.
 */
import type { Doc } from "../_generated/dataModel";
import { DOMAINS } from "../marking/score";

export const CSV_BOM = "﻿";

type Cell = string | number | null | undefined;

/** Characters that make a spreadsheet treat a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One escaped CSV field. `null`/`undefined` become an empty field. */
export function csvCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  let s = typeof value === "number" ? String(value) : value;
  if (typeof value === "string" && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Whole CSV document (BOM, CRLF line endings, trailing CRLF). */
export function toCsv(rows: readonly (readonly Cell[])[]): string {
  return CSV_BOM + rows.map((r) => r.map(csvCell).join(",") + "\r\n").join("");
}

export const CSV_HEADER: readonly string[] = [
  "Name",
  "Mode",
  "Status",
  "Started (UTC)",
  "Submitted (UTC)",
  "Submitted by",
  "Time used (min)",
  "Scaled score",
  "Result",
  "Points",
  "Total points",
  "Flagged",
  ...DOMAINS.map((d) => `Domain ${d} (%)`),
  "Attempt ID",
];

const iso = (ms: number | undefined) => (ms === undefined ? "" : new Date(ms).toISOString());

/** One CSV row for an attempt. Scores are blank unless it was submitted with a result. */
export function csvRow(a: Doc<"attempts">): Cell[] {
  const r = a.status === "submitted" ? a.result : undefined;
  const domains = new Map(r?.domains.map((d) => [d.domain, d]) ?? []);
  return [
    a.displayName ?? "",
    a.mode,
    a.status,
    iso(a.startedAt),
    iso(a.submittedAt),
    a.submittedBy,
    r ? Math.round((r.timeUsedSec / 60) * 10) / 10 : undefined,
    r?.scaled,
    r ? (r.passed ? "Pass" : "Fail") : undefined,
    r?.points,
    r?.totalPoints,
    r?.flaggedCount,
    ...DOMAINS.map((d) => {
      const x = domains.get(d);
      return x && x.max > 0 ? Math.round((x.points / x.max) * 100) : undefined;
    }),
    a._id,
  ];
}

/** The class CSV: header plus one row per attempt, in the given order. */
export function classCsv(attempts: readonly Doc<"attempts">[]): string {
  return toCsv([CSV_HEADER, ...attempts.map(csvRow)]);
}
