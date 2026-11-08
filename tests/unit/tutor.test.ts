import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  ATTEMPT_FILTERS,
  attemptCount,
  attemptName,
  attemptResultBadge,
  classNameProblem,
  classStatusBadge,
  csvFilename,
  domainBarHeight,
  filterCounts,
  filterLabel,
  formatDuration,
  formatPercent,
  formatScore,
  joinUrl,
  matchesFilter,
  missedLabel,
  MULTIPLIER_OPTIONS,
  multiplierLabel,
  multiplierOptionLabel,
  nextSort,
  pruneSelection,
  relativeTime,
  selectionState,
  sortAttempts,
  tutorErrorMessage,
  versionOptions,
  type AttemptRowLike,
} from "../../app/lib/tutor";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
// Sun 8 Nov 2026, 12:00 UTC.
const NOW = Date.UTC(2026, 10, 8, 12, 0);
const UTC = "UTC";

function row(over: Partial<AttemptRowLike> & { attemptId: string }): AttemptRowLike {
  return { displayName: over.attemptId, status: "submitted", startedAt: NOW - 2 * HOUR, ...over };
}

const amara = row({
  attemptId: "a",
  displayName: "Amara Okafor",
  submittedAt: NOW - 10 * MIN,
  scaled: 814,
  passed: true,
  timeUsedSec: 4900,
});
const tunde = row({
  attemptId: "t",
  displayName: "Tunde Bello",
  submittedAt: NOW - 20 * MIN,
  scaled: 743,
  passed: false,
  timeUsedSec: 5400,
});
const zainab = row({
  attemptId: "z",
  displayName: "zainab Musa",
  submittedAt: NOW - 30 * MIN,
  scaled: 853,
  passed: true,
  timeUsedSec: 4328,
});
const kofi = row({
  attemptId: "k",
  displayName: "Kofi",
  status: "in_progress",
  startedAt: NOW - 5 * MIN,
});
const ife = row({
  attemptId: "i",
  displayName: "Ife",
  status: "expired",
  startedAt: NOW - 3 * HOUR,
});
const ROWS = [amara, tunde, zainab, kofi, ife];

describe("class wording", () => {
  it("labels status", () => {
    expect(classStatusBadge("open")).toEqual({ label: "Open", tone: "ok" });
    expect(classStatusBadge("closed")).toEqual({ label: "Closed", tone: "muted" });
  });

  it("labels time multipliers (EX-21)", () => {
    expect(multiplierLabel(1)).toBe("Standard time");
    expect(multiplierLabel(1.25)).toBe("1.25× time");
    expect(multiplierOptionLabel(1.5)).toBe("1.5× time · 135 min");
    expect(multiplierOptionLabel(2)).toBe("2× time · 180 min");
    expect(MULTIPLIER_OPTIONS.map((o) => o.value)).toEqual([1, 1.25, 1.5, 2]);
    expect(MULTIPLIER_OPTIONS[0]!.label).toBe("Standard time · 90 min");
  });

  it("checks class names like classes.create", () => {
    expect(classNameProblem("  ")).toBe("Give the class a name.");
    expect(classNameProblem("x".repeat(81))).toMatch(/80 characters/);
    expect(classNameProblem(` ${"x".repeat(80)} `)).toBe("");
  });

  it("builds the join link", () => {
    expect(joinUrl("https://salus.test/", "SEC-4K7Q")).toBe(
      "https://salus.test/start?class=SEC-4K7Q",
    );
  });

  it("offers published versions only, the default first", () => {
    const opts = versionOptions([
      { versionId: "d1", label: "Mine v1", status: "draft", isDefault: false, publishedAt: null },
      { versionId: "p1", label: "Mine v2", status: "published", isDefault: false, publishedAt: 5 },
      { versionId: "df", label: "SY0-701", status: "published", isDefault: true, publishedAt: 1 },
      { versionId: "a1", label: "Old", status: "archived", isDefault: false, publishedAt: 2 },
      { versionId: "p0", label: "Mine v0", status: "published", isDefault: false, publishedAt: 3 },
    ]);
    expect(opts).toEqual([
      { label: "SY0-701 · Default exam", value: "df" },
      { label: "Mine v2", value: "p1" },
      { label: "Mine v0", value: "p0" },
    ]);
  });
});

describe("csvFilename", () => {
  it("slugs the class name and dates the file", () => {
    expect(csvFilename("Cyber Ops · Evening cohort", NOW, UTC)).toBe(
      "salus-cyber-ops-evening-cohort-2026-11-08.csv",
    );
    expect(csvFilename("Équipe Sécurité #2", NOW, UTC)).toBe(
      "salus-equipe-securite-2-2026-11-08.csv",
    );
  });

  it("falls back when nothing is left and trims long names", () => {
    expect(csvFilename("···", NOW, UTC)).toBe("salus-class-2026-11-08.csv");
    const long = csvFilename(`${"a".repeat(59)} bbbb`, NOW, UTC);
    expect(long).toBe(`salus-${"a".repeat(59)}-2026-11-08.csv`);
  });

  it("uses the given time zone for the date", () => {
    const lateUtc = Date.UTC(2026, 10, 8, 23, 30);
    expect(csvFilename("A", lateUtc, "Africa/Lagos")).toBe("salus-a-2026-11-09.csv");
  });
});

describe("attempt filters", () => {
  it("labels filters, using the pass mark for failures", () => {
    expect(ATTEMPT_FILTERS.map((f) => filterLabel(f))).toEqual([
      "All",
      "Submitted",
      "In progress",
      "Passed",
      "Below 750",
      "Expired",
    ]);
    expect(filterLabel("failed", 700)).toBe("Below 700");
  });

  it("matches like the server", () => {
    expect(ROWS.filter((r) => matchesFilter(r, "passed")).map((r) => r.attemptId)).toEqual([
      "a",
      "z",
    ]);
    expect(ROWS.filter((r) => matchesFilter(r, "failed")).map((r) => r.attemptId)).toEqual(["t"]);
    expect(ROWS.filter((r) => matchesFilter(r, "in_progress")).map((r) => r.attemptId)).toEqual([
      "k",
    ]);
    expect(ROWS.filter((r) => matchesFilter(r, "all"))).toHaveLength(5);
  });

  it("counts every filter", () => {
    expect(filterCounts(ROWS)).toEqual({
      all: 5,
      submitted: 3,
      in_progress: 1,
      passed: 2,
      failed: 1,
      expired: 1,
    });
  });

  it("badges results", () => {
    expect(attemptResultBadge(amara)).toEqual({ label: "Pass", tone: "ok" });
    expect(attemptResultBadge(tunde)).toEqual({ label: "Below 750", tone: "bad" });
    expect(attemptResultBadge(kofi)).toEqual({ label: "In progress", tone: "brand" });
    expect(attemptResultBadge(ife)).toEqual({ label: "Expired", tone: "warn" });
    expect(attemptResultBadge(row({ attemptId: "x" }))).toEqual({
      label: "Submitted",
      tone: "muted",
    });
  });
});

describe("sorting", () => {
  const ids = (rows: AttemptRowLike[]) => rows.map((r) => r.attemptId);

  it("sorts by date, newest first by default", () => {
    // Kofi started 5 min ago (no submit), Amara submitted 10 min ago…
    expect(ids(sortAttempts(ROWS, "when", "desc"))).toEqual(["k", "a", "t", "z", "i"]);
    expect(ids(sortAttempts(ROWS, "when", "asc"))).toEqual(["i", "z", "t", "a", "k"]);
  });

  it("sorts by score with unscored rows last either way", () => {
    expect(ids(sortAttempts(ROWS, "score", "desc"))).toEqual(["z", "a", "t", "k", "i"]);
    expect(ids(sortAttempts(ROWS, "score", "asc"))).toEqual(["t", "a", "z", "k", "i"]);
  });

  it("sorts names case-insensitively, and by time and result", () => {
    expect(ids(sortAttempts(ROWS, "name", "asc"))).toEqual(["a", "i", "k", "t", "z"]);
    expect(ids(sortAttempts(ROWS, "time", "desc")).slice(0, 3)).toEqual(["t", "a", "z"]);
    expect(ids(sortAttempts(ROWS, "result", "desc"))).toEqual(["k", "a", "z", "t", "i"]);
  });

  it("does not mutate its input", () => {
    const copy = [...ROWS];
    sortAttempts(ROWS, "name", "asc");
    expect(ROWS).toEqual(copy);
  });

  it("flips the same key and starts new keys sensibly", () => {
    expect(nextSort({ key: "when", dir: "desc" }, "when")).toEqual({ key: "when", dir: "asc" });
    expect(nextSort({ key: "when", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
    expect(nextSort({ key: "name", dir: "asc" }, "score")).toEqual({ key: "score", dir: "desc" });
  });
});

describe("selection", () => {
  it("drops ids that are no longer listed", () => {
    expect([...pruneSelection(new Set(["a", "gone"]), ROWS)]).toEqual(["a"]);
  });

  it("reports the header checkbox state", () => {
    expect(selectionState(new Set(), ROWS)).toBe(false);
    expect(selectionState(new Set(["a"]), ROWS)).toBe("indeterminate");
    expect(selectionState(new Set(ROWS.map((r) => r.attemptId)), ROWS)).toBe(true);
    expect(selectionState(new Set(["a"]), [])).toBe(false);
  });

  it("names rows and counts", () => {
    expect(attemptName({ displayName: "  " })).toBe("Unnamed student");
    expect(attemptName({ displayName: " Amara " })).toBe("Amara");
    expect(attemptCount(1)).toBe("1 attempt");
    expect(attemptCount(3)).toBe("3 attempts");
  });
});

describe("formatting", () => {
  it("formats durations", () => {
    expect(formatDuration(4900)).toBe("1:21:40");
    expect(formatDuration(5400)).toBe("1:30:00");
    expect(formatDuration(59.6)).toBe("0:01:00");
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
  });

  it("formats scores and percentages", () => {
    expect(formatScore(767.6)).toBe("768");
    expect(formatScore(null)).toBe("—");
    expect(formatPercent(0.625)).toBe("63%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(null)).toBe("—");
  });

  it("formats relative times", () => {
    expect(relativeTime(NOW - 20_000, NOW, UTC)).toBe("Just now");
    expect(relativeTime(NOW - 5 * MIN, NOW, UTC)).toBe("5 min ago");
    expect(relativeTime(NOW - 3 * HOUR, NOW, UTC)).toBe("3 h ago");
    expect(relativeTime(Date.UTC(2026, 10, 7, 19, 42), NOW, UTC)).toBe("7 Nov · 19:42");
    expect(relativeTime(Date.UTC(2025, 10, 7, 19, 42), NOW, UTC)).toBe("7 Nov 2025 · 19:42");
  });

  it("sizes domain bars", () => {
    expect(domainBarHeight(0.84)).toBe(84);
    expect(domainBarHeight(0)).toBe(6);
    expect(domainBarHeight(null)).toBe(6);
    expect(domainBarHeight(1.2)).toBe(100);
  });

  it("labels most-missed questions", () => {
    expect(missedLabel({ displayNumber: "47", kind: "mcq" })).toBe("Q47");
    expect(missedLabel({ displayNumber: "3", kind: "pbq" })).toBe("P3");
    expect(missedLabel({ displayNumber: "B3", kind: "pbq" })).toBe("B3");
  });
});

describe("tutorErrorMessage", () => {
  it("words server codes", () => {
    const err = (code: string) => new ConvexError({ code });
    expect(tutorErrorMessage(err("NOT_FOUND"), "load")).toMatch(/isn't one of yours/);
    expect(tutorErrorMessage(err("NOT_FOUND"), "create")).toMatch(/exam version/);
    expect(tutorErrorMessage(err("VALIDATION_FAILED"), "create")).toMatch(/1–80 characters/);
    expect(tutorErrorMessage(err("FORBIDDEN"), "update")).toMatch(/session has ended/);
    expect(tutorErrorMessage(new Error("offline"), "load")).toMatch(/connection/);
  });
});
