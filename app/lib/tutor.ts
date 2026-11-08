/**
 * Pure helpers for the tutor area (LLD §14.1 `/tutor`, `/tutor/classes/[id]`;
 * PRD CL-1 to CL-8, CL-11, EX-21): class and attempt wording, the attempt
 * table's filter and sort, stats formatting, the CSV filename and the
 * student join link. Wording follows mockup screen 09 ("Tutor class").
 */
import type { Badge } from "./admin";
import { formatDate } from "./admin";
import { errorCodeOf } from "./attemptSync";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// ----------------------------------------------------------------- classes

export type ClassStatus = "open" | "closed";

export function classStatusBadge(status: ClassStatus): Badge {
  return status === "open" ? { label: "Open", tone: "ok" } : { label: "Closed", tone: "muted" };
}

/** EX-21 multipliers `classes.create` / `classes.update` accept. */
export const TIME_MULTIPLIERS = [1, 1.25, 1.5, 2] as const;
export type TimeMultiplier = (typeof TIME_MULTIPLIERS)[number];

/** The standard paper's time limit (`exams.timeLimitMin`). */
export const BASE_EXAM_MINUTES = 90;

/** "1.25×" (the multiplier itself). */
export function multiplierShort(m: number): string {
  return `${m}×`;
}

/** "Standard time", or "1.5× time". */
export function multiplierLabel(m: number): string {
  return m === 1 ? "Standard time" : `${multiplierShort(m)} time`;
}

/** Picker wording: "Standard time · 90 min", "1.5× time · 135 min". */
export function multiplierOptionLabel(m: number, baseMinutes = BASE_EXAM_MINUTES): string {
  return `${multiplierLabel(m)} · ${Math.round(baseMinutes * m)} min`;
}

export const MULTIPLIER_OPTIONS: { label: string; value: number }[] = TIME_MULTIPLIERS.map((m) => ({
  label: multiplierOptionLabel(m),
  value: m,
}));

/** `classes.create` refuses names outside 1–80 characters after trimming. */
export const CLASS_NAME_MAX = 80;

/** A problem with a class name, or `""` when it is fine. */
export function classNameProblem(name: string): string {
  const clean = name.trim();
  if (clean.length === 0) return "Give the class a name.";
  if (clean.length > CLASS_NAME_MAX) return `Keep the name to ${CLASS_NAME_MAX} characters.`;
  return "";
}

/** The start-screen link a student opens to join (T-508: `/start?class=SEC-XXXX`). */
export function joinUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/start?class=${encodeURIComponent(code)}`;
}

/** Version picker items: published versions only, the default first, then newest. */
export interface VersionLike {
  versionId: string;
  label: string;
  status: "draft" | "published" | "archived";
  isDefault: boolean;
  publishedAt: number | null;
}

export function versionOptions<V extends VersionLike>(
  versions: readonly V[],
): { label: string; value: V["versionId"] }[] {
  return versions
    .filter((v) => v.status === "published")
    .sort(
      (a, b) =>
        Number(b.isDefault) - Number(a.isDefault) || (b.publishedAt ?? 0) - (a.publishedAt ?? 0),
    )
    .map((v) => ({
      label: v.isDefault ? `${v.label} · Default exam` : v.label,
      value: v.versionId,
    }));
}

/** "salus-cyber-ops-evening-cohort-2026-11-08.csv" (local date unless `timeZone`). */
export function csvFilename(className: string, at: number, timeZone?: string): string {
  const slug = className
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return `salus-${slug || "class"}-${date}.csv`;
}

// ---------------------------------------------------------------- attempts

export type AttemptStatus = "in_progress" | "submitted" | "expired";
export type AttemptFilter = "all" | "in_progress" | "submitted" | "expired" | "passed" | "failed";

/** The fields of a `classes.attempts` row these helpers read. */
export interface AttemptRowLike {
  attemptId: string;
  displayName: string;
  status: AttemptStatus;
  startedAt: number;
  submittedAt?: number;
  scaled?: number;
  passed?: boolean;
  timeUsedSec?: number;
}

export const ATTEMPT_FILTERS: readonly AttemptFilter[] = [
  "all",
  "submitted",
  "in_progress",
  "passed",
  "failed",
  "expired",
];

/** Filter chip wording; "failed" uses the pass mark as the mockup does ("Below 750"). */
export function filterLabel(filter: AttemptFilter, passScaled = 750): string {
  switch (filter) {
    case "all":
      return "All";
    case "submitted":
      return "Submitted";
    case "in_progress":
      return "In progress";
    case "passed":
      return "Passed";
    case "failed":
      return `Below ${passScaled}`;
    case "expired":
      return "Expired";
  }
}

/** Same rules as the server's `matchesFilter` (convex/lib/classStats.ts). */
export function matchesFilter(row: AttemptRowLike, filter: AttemptFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "passed":
      return row.status === "submitted" && row.passed === true;
    case "failed":
      return row.status === "submitted" && row.passed === false;
    default:
      return row.status === filter;
  }
}

/** How many rows each filter keeps, for the chip counts. */
export function filterCounts(rows: readonly AttemptRowLike[]): Record<AttemptFilter, number> {
  const counts = Object.fromEntries(ATTEMPT_FILTERS.map((f) => [f, 0])) as Record<
    AttemptFilter,
    number
  >;
  for (const row of rows) for (const f of ATTEMPT_FILTERS) if (matchesFilter(row, f)) counts[f]++;
  return counts;
}

/** Result pill: "Pass", "Below 750", "In progress", "Expired" (or "Submitted" while unmarked). */
export function attemptResultBadge(row: AttemptRowLike, passScaled = 750): Badge {
  if (row.status === "in_progress") return { label: "In progress", tone: "brand" };
  if (row.status === "expired") return { label: "Expired", tone: "warn" };
  if (row.passed === true) return { label: "Pass", tone: "ok" };
  if (row.passed === false) return { label: `Below ${passScaled}`, tone: "bad" };
  return { label: "Submitted", tone: "muted" };
}

export type SortKey = "name" | "when" | "score" | "result" | "time";
export type SortDir = "asc" | "desc";

/** The time a row is dated by: when it was submitted, else when it started. */
export function attemptWhen(row: AttemptRowLike): number {
  return row.submittedAt ?? row.startedAt;
}

function resultRank(row: AttemptRowLike): number {
  if (row.status === "in_progress") return 3;
  if (row.status === "expired") return 0;
  return row.passed ? 2 : 1;
}

/**
 * A sorted copy. Rows without a value for the key (no score yet) always go
 * last; ties fall back to newest first, then name.
 */
export function sortAttempts<R extends AttemptRowLike>(
  rows: readonly R[],
  key: SortKey,
  dir: SortDir,
): R[] {
  const sign = dir === "asc" ? 1 : -1;
  const value = (r: R): number | string | undefined => {
    switch (key) {
      case "name":
        return r.displayName.trim().toLocaleLowerCase();
      case "when":
        return attemptWhen(r);
      case "score":
        return r.scaled;
      case "result":
        return resultRank(r);
      case "time":
        return r.timeUsedSec;
    }
  };
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === undefined && vb !== undefined) return 1;
    if (vb === undefined && va !== undefined) return -1;
    if (va !== undefined && vb !== undefined && va !== vb) {
      const cmp = typeof va === "string" ? va.localeCompare(vb as string) : va - (vb as number);
      if (cmp !== 0) return sign * cmp;
    }
    return attemptWhen(b) - attemptWhen(a) || a.displayName.localeCompare(b.displayName);
  });
}

/** Clicking a header: same key flips, a new key starts at its natural direction. */
export function nextSort(
  current: { key: SortKey; dir: SortDir },
  key: SortKey,
): { key: SortKey; dir: SortDir } {
  if (current.key === key) return { key, dir: current.dir === "asc" ? "desc" : "asc" };
  return { key, dir: key === "name" ? "asc" : "desc" };
}

/** The selection after the list changed: ids that are no longer listed are dropped. */
export function pruneSelection(selected: ReadonlySet<string>, rows: readonly AttemptRowLike[]) {
  const listed = new Set(rows.map((r) => r.attemptId));
  return new Set([...selected].filter((id) => listed.has(id)));
}

/** Header checkbox state for the visible rows. */
export function selectionState(
  selected: ReadonlySet<string>,
  rows: readonly AttemptRowLike[],
): boolean | "indeterminate" {
  if (rows.length === 0) return false;
  const n = rows.filter((r) => selected.has(r.attemptId)).length;
  return n === 0 ? false : n === rows.length ? true : "indeterminate";
}

/** A name for a row; `""` only for attempts made before display names were required. */
export function attemptName(row: Pick<AttemptRowLike, "displayName">): string {
  return row.displayName.trim() || "Unnamed student";
}

/** "1 attempt", "3 attempts". */
export function attemptCount(n: number): string {
  return n === 1 ? "1 attempt" : `${n} attempts`;
}

// ------------------------------------------------------------- formatting

/** "1:21:40", or "—" with no value. */
export function formatDuration(sec: number | undefined | null): string {
  if (sec === undefined || sec === null || !Number.isFinite(sec) || sec < 0) return "—";
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

/** A scaled score as a whole number, or "—". */
export function formatScore(scaled: number | null | undefined): string {
  return scaled === null || scaled === undefined ? "—" : String(Math.round(scaled));
}

/** A 0–1 share as "63%", or "—". */
export function formatPercent(rate: number | null | undefined): string {
  return rate === null || rate === undefined || !Number.isFinite(rate)
    ? "—"
    : `${Math.round(rate * 100)}%`;
}

/** "Just now", "5 min ago", "3 h ago", "Yesterday · 19:42" / "7 Nov · 19:42" past a day. */
export function relativeTime(at: number, now: number, timeZone?: string): string {
  const ago = now - at;
  if (ago < MINUTE_MS) return "Just now";
  if (ago < HOUR_MS) return `${Math.floor(ago / MINUTE_MS)} min ago`;
  if (ago < 12 * HOUR_MS) return `${Math.floor(ago / HOUR_MS)} h ago`;
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return `${formatDate(at, now, timeZone)} · ${time}`;
}

/** SY0-701 domain names (content/seed/sy0-701.json). */
export const DOMAIN_NAMES: Record<string, string> = {
  "1.0": "General Security Concepts",
  "2.0": "Threats, Vulnerabilities and Mitigations",
  "3.0": "Security Architecture",
  "4.0": "Security Operations",
  "5.0": "Security Program Management and Oversight",
};

/** Bar height (as a %) for a domain share; empty domains get a stub. */
export function domainBarHeight(share: number | null): number {
  if (share === null) return 6;
  return Math.max(6, Math.min(100, Math.round(share * 100)));
}

/** Most-missed label: MCQ "47" → "Q47", PBQ "1" → "P1"; "B3" (retake PBQs) stays as it is. */
export function missedLabel(q: { displayNumber: string; kind: "mcq" | "pbq" }): string {
  const n = q.displayNumber.trim();
  if (/^[A-Za-z]/.test(n)) return n;
  return `${q.kind === "pbq" ? "P" : "Q"}${n}`;
}

// ------------------------------------------------------------------ errors

export type TutorAction = "create" | "update" | "load";

/** A message for a failed class call (LLD §16 codes). */
export function tutorErrorMessage(err: unknown, action: TutorAction): string {
  switch (errorCodeOf(err)) {
    case "VALIDATION_FAILED":
      return action === "load"
        ? "That request wasn't accepted. Check the details and try again."
        : `Check the class: a name of 1–${CLASS_NAME_MAX} characters and one of the listed times.`;
    case "NOT_FOUND":
      return action === "load"
        ? "This class doesn't exist, or it isn't one of yours."
        : "That exam version can't be used. Pick a published version from the list.";
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
      return "Your session has ended. Sign in again to continue.";
  }
  return "Something went wrong. Check your connection and try again.";
}
