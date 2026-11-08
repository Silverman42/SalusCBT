import { describe, expect, it } from "vitest";
import {
  appendPage,
  canLoadMore,
  emptyPager,
  historyErrorMessage,
  historyRow,
  importConfirmText,
  type AttemptSummary,
} from "../../app/lib/history";
import { IMPORT_ERRORS } from "../../app/lib/anonIdentity";

type Id = AttemptSummary["attemptId"];
const NOW = Date.UTC(2026, 10, 8, 12);
const attempt = (over: Partial<AttemptSummary> = {}): AttemptSummary => ({
  attemptId: "a1" as Id,
  mode: "standard",
  status: "submitted",
  startedAt: Date.UTC(2026, 10, 7, 9),
  deadline: Date.UTC(2026, 10, 7, 10, 30),
  submittedAt: Date.UTC(2026, 10, 7, 10, 20),
  scaled: 814,
  passed: true,
  points: 91,
  totalPoints: 102,
  ...over,
});
const unscored = {
  submittedAt: undefined,
  scaled: undefined,
  passed: undefined,
  points: undefined,
  totalPoints: undefined,
};

describe("historyRow (T-217)", () => {
  it("formats a passed attempt with result and review links", () => {
    expect(historyRow(attempt(), NOW)).toEqual({
      attemptId: "a1",
      title: "7 Nov 2026 · Standard",
      score: "814",
      points: "91 / 102 points",
      badge: { label: "Pass", tone: "ok" },
      links: [
        { label: "Result", to: "/exam/a1/result", icon: "i-lucide-chart-column", primary: true },
        { label: "Review", to: "/exam/a1/review", icon: "i-lucide-book-open" },
      ],
    });
  });

  it("marks a failed retake", () => {
    const row = historyRow(attempt({ mode: "retake", scaled: 743, passed: false }), NOW);
    expect(row.title).toBe("7 Nov 2026 · Retake (PBQ set B)");
    expect(row.badge).toEqual({ label: "Below 750", tone: "bad" });
  });

  it("offers resume for a running attempt, and not once its time is up", () => {
    const running = attempt({
      ...unscored,
      status: "in_progress",
      startedAt: NOW - 60_000,
      deadline: NOW + 60_000,
    });
    const row = historyRow(running, NOW);
    expect(row.title).toBe("8 Nov 2026 · Standard");
    expect(row.score).toBeNull();
    expect(row.badge.label).toBe("In progress");
    expect(row.links).toEqual([
      { label: "Resume", to: "/exam/a1", icon: "i-lucide-play", primary: true },
    ]);
    const late = historyRow({ ...running, deadline: NOW - 1 }, NOW);
    expect(late.badge.label).toBe("Time's up");
    expect(late.links.map((l) => l.label)).toEqual(["Open"]);
  });

  it("shows expired attempts without links", () => {
    const row = historyRow(attempt({ ...unscored, status: "expired" }), NOW);
    expect(row.badge).toEqual({ label: "No result", tone: "muted" });
    expect(row.links).toEqual([]);
  });
});

describe("history pager (T-217)", () => {
  it("appends pages, skips duplicates and tracks the cursor", () => {
    let p = emptyPager();
    expect(canLoadMore(p)).toBe(true);
    p = appendPage(
      { ...p, loading: true },
      {
        page: [attempt(), attempt({ attemptId: "a2" as Id })],
        isDone: false,
        continueCursor: "c1",
      },
    );
    expect(p.items.map((i) => i.attemptId)).toEqual(["a1", "a2"]);
    expect(p.cursor).toBe("c1");
    expect(p.loading).toBe(false);
    expect(canLoadMore(p)).toBe(true);
    p = appendPage(p, {
      page: [attempt({ attemptId: "a2" as Id }), attempt({ attemptId: "a3" as Id })],
      isDone: true,
      continueCursor: "c2",
    });
    expect(p.items.map((i) => i.attemptId)).toEqual(["a1", "a2", "a3"]);
    expect(canLoadMore(p)).toBe(false);
  });

  it("does not load more while loading or after an error", () => {
    expect(canLoadMore({ ...emptyPager(), loading: true })).toBe(false);
    expect(canLoadMore({ ...emptyPager(), error: "x" })).toBe(false);
  });
});

describe("history messages (T-217, EX-20)", () => {
  it("explains load errors", () => {
    expect(historyErrorMessage("BAD_TOKEN")).toMatch(/anonymous ID/);
    expect(historyErrorMessage(null)).toMatch(/connection/);
  });

  it("describes what an import replaces", () => {
    expect(importConfirmText({})).toBe(
      "This replaces the anonymous ID in this browser with the one in the file. " +
        "The history shown here now will be hidden: export it first if you want to keep it.",
    );
    expect(
      importConfirmText({ displayName: "Ada", exportedAt: "2026-11-07T10:00:00.000Z" }),
    ).toMatch(/file \(name "Ada", exported 7 Nov 2026\)\./);
    expect(importConfirmText({ exportedAt: "not a date" })).not.toMatch(/exported/);
  });

  it("import errors from anonIdentity are user-facing sentences", () => {
    for (const msg of Object.values(IMPORT_ERRORS)) expect(msg).toMatch(/^[A-Z].*\.$/);
  });
});
